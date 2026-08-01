"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { buildExpiringWithinDays } from "@/lib/finance";
import { sendTransactionalEmail } from "@/lib/resend";
import { formatDateFr } from "@/lib/utils";
import EventRegistrationEmail from "@/emails/event-registration-email";
import EventPaymentReminderEmail from "@/emails/event-payment-reminder-email";
import MembershipRenewalReminderEmail from "@/emails/membership-renewal-reminder-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E8-T10 — "Liste paiements ... + validation manuelle virements". Débloque
 * un vrai cul-de-sac : une inscription payée par virement/mobile money
 * restait en PENDING pour toujours, aucune action admin n'existait pour la
 * confirmer (seul un email d'alerte était envoyé à la soumission, E3-T03).
 */
export async function confirmEventPayment(registrationId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("finances");

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { user: true, event: true },
  });
  if (!registration) return { success: false, error: "Inscription introuvable." };
  if (registration.paymentStatus !== "PENDING") {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }

  await prisma.eventRegistration.update({
    where: { id: registrationId },
    data: { status: "CONFIRMED", paymentStatus: "PAID" },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "event_registration.confirm_payment",
      targetType: "EventRegistration",
      targetId: registrationId,
    },
  });

  const qrCodeDataUrl = await QRCode.toDataURL(registration.badgeQrCode);
  await sendTransactionalEmail({
    to: registration.user.email,
    subject: `Paiement confirmé — ${registration.event.title}`,
    react: EventRegistrationEmail({
      memberName: registration.user.name,
      eventTitle: registration.event.title,
      eventDateLabel: formatDateFr(registration.event.date),
      eventLocation: registration.event.isOnline ? "En ligne" : registration.event.location,
      qrCodeDataUrl,
      requiresManualValidation: false,
    }),
  });

  revalidatePath("/admin/finances");
  return { success: true, data: undefined };
}

export async function sendEventPaymentReminder(registrationId: string): Promise<ActionResult> {
  await requireAdmin("finances");

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { user: true, event: true },
  });
  if (!registration) return { success: false, error: "Inscription introuvable." };

  await sendTransactionalEmail({
    to: registration.user.email,
    subject: `Paiement en attente — ${registration.event.title}`,
    react: EventPaymentReminderEmail({
      memberName: registration.user.name,
      eventTitle: registration.event.title,
      amount: registration.event.price,
    }),
  });

  return { success: true, data: undefined };
}

/**
 * E8-T10 — "✉ Relancer les X expiration imminente". Manuel plutôt qu'automatique
 * (pas d'infra de tâches planifiées dans ce projet, voir MembershipRenewalReminderEmail).
 */
export async function sendRenewalReminders(
  withinDays: number
): Promise<ActionResult<{ sent: number }>> {
  await requireAdmin("finances");

  const now = new Date();
  const members = await prisma.membership.findMany({
    where: { status: "ACTIVE", endDate: buildExpiringWithinDays(withinDays, now) },
    include: { user: { select: { name: true, email: true } } },
  });

  // Phase 2ter (1er août 2026) — une adhésion issue d'une offre librement
  // créée par l'admin (pas l'un des 3 tiers historiques) n'a pas de `tier`
  // : ce template email hardcode encore l'affichage par tier legacy, donc
  // on ne relance que les adhésions qui en ont un pour l'instant plutôt
  // que de planter — un rework du template pour afficher `plan.name`
  // reste à faire séparément si le besoin se confirme.
  await Promise.all(
    members
      .filter((m): m is typeof m & { tier: NonNullable<(typeof m)["tier"]> } => m.tier != null)
      .map((m) =>
        sendTransactionalEmail({
          to: m.user.email,
          subject: `Votre adhésion CEO Summit ${m.tier} arrive à échéance`,
          react: MembershipRenewalReminderEmail({
            memberName: m.user.name,
            tier: m.tier,
            endDateLabel: formatDateFr(m.endDate!),
          }),
        })
      )
  );

  return { success: true, data: { sent: members.length } };
}
