"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import { formatDateFr } from "@/lib/utils";
import EventRegistrationEmail from "@/emails/event-registration-email";
import EventPaymentReminderEmail from "@/emails/event-payment-reminder-email";

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
