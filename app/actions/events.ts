"use server";

import QRCode from "qrcode";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  withEventRegistrationLock,
  RegistrationLockBusyError,
} from "@/lib/event-registration-lock";
import { sendTransactionalEmail } from "@/lib/resend";
import EventRegistrationEmail from "@/emails/event-registration-email";
import AdminEventPaymentAlertEmail from "@/emails/admin-event-payment-alert-email";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { formatDateFr, meetsMinTier } from "@/lib/utils";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

class EventFullError extends Error {}

const registerSchema = z.object({
  eventId: z.string().min(1),
  paymentMethod: z.enum(["VIREMENT", "MOBILE_MONEY"]).optional(),
});

/**
 * E3-T03 — inscription à un événement + choix du mode de paiement.
 * Ref: BACKLOG_DEV.md E3-T03 + phase3 wireframes (inscription-evenement.html,
 * simplifié au périmètre backlog : pas de formules/options additionnelles,
 * pas d'accompagnants — ces éléments du wireframe ne sont pas dans le
 * schéma ni dans les critères d'acceptation actuels).
 */
export async function registerForEvent(
  eventId: string,
  paymentMethod?: "VIREMENT" | "MOBILE_MONEY"
): Promise<ActionResult<{ registrationId: string }>> {
  const parsed = registerSchema.safeParse({ eventId, paymentMethod });
  if (!parsed.success) {
    return { success: false, error: "Requête invalide." };
  }

  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const [event, viewer, existing] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: VIEWER_TIER_INCLUDE,
    }),
    prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId: session.user.id } },
    }),
  ]);

  if (!event || event.status !== "PUBLISHED") {
    return { success: false, error: "Cet événement n'est pas disponible à l'inscription." };
  }
  if (event.date < new Date()) {
    return { success: false, error: "Cet événement est déjà passé." };
  }
  if (!viewer) return { success: false, error: "Non authentifié." };
  if (!meetsMinTier(getViewerTierFromCompany(viewer.company), event.minTier)) {
    return {
      success: false,
      error: "Votre niveau de membership ne donne pas accès à cet événement.",
    };
  }
  if (existing) {
    return { success: false, error: "Vous êtes déjà inscrit(e) à cet événement." };
  }

  const isFree = event.price === 0;
  const method = isFree ? ("INCLUS" as const) : parsed.data.paymentMethod;
  if (!isFree && !method) {
    return { success: false, error: "Choisissez un mode de paiement." };
  }

  let registration: { id: string; badgeQrCode: string };
  try {
    registration = await withEventRegistrationLock(eventId, async () => {
      const takenSpots = await prisma.eventRegistration.count({
        where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
      });
      if (takenSpots >= event.capacity) {
        throw new EventFullError();
      }

      return prisma.eventRegistration.create({
        data: {
          eventId,
          userId: viewer.id,
          status: isFree ? "CONFIRMED" : "PENDING_PAYMENT",
          paymentStatus: isFree ? "PAID" : "PENDING",
          paymentMethod: method,
        },
      });
    });
  } catch (err) {
    if (err instanceof EventFullError)
      return { success: false, error: "Cet événement est complet." };
    if (err instanceof RegistrationLockBusyError) return { success: false, error: err.message };
    throw err;
  }

  const qrCodeDataUrl = await QRCode.toDataURL(registration.badgeQrCode);

  await sendTransactionalEmail({
    to: viewer.email,
    subject: `Inscription confirmée — ${event.title}`,
    react: EventRegistrationEmail({
      memberName: viewer.name,
      eventTitle: event.title,
      eventDateLabel: formatDateFr(event.date),
      eventLocation: event.isOnline ? "En ligne" : event.location,
      qrCodeDataUrl,
      requiresManualValidation: method === "VIREMENT",
    }),
  });

  if (method === "VIREMENT" && process.env.ADMIN_ALERT_EMAIL) {
    await sendTransactionalEmail({
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Virement à valider — ${event.title}`,
      react: AdminEventPaymentAlertEmail({
        memberName: viewer.name,
        memberEmail: viewer.email,
        eventTitle: event.title,
        amount: event.price,
      }),
    });
  }

  return { success: true, data: { registrationId: registration.id } };
}

/**
 * Sprint de correction (5 août 2026, EX-T01) — un membre inscrit n'avait
 * auparavant aucun moyen de se désinscrire lui-même. `RegistrationStatus.
 * CANCELLED` existait déjà dans le schéma mais n'était jamais posé nulle
 * part. Ne rembourse pas automatiquement un paiement déjà effectué (virement/
 * mobile money hors plateforme, sans passerelle de paiement en ligne) — un
 * remboursement reste, comme le paiement lui-même, une démarche manuelle
 * avec l'équipe CEO Summit.
 */
export async function cancelEventRegistration(eventId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { success: false, error: "Événement introuvable." };
  if (event.date < new Date()) {
    return { success: false, error: "Impossible d'annuler une inscription à un évènement passé." };
  }

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId: session.user.id } },
  });
  if (!registration)
    return { success: false, error: "Vous n'êtes pas inscrit(e) à cet évènement." };
  if (registration.status === "CANCELLED") {
    return { success: false, error: "Cette inscription est déjà annulée." };
  }
  if (registration.checkedIn) {
    return {
      success: false,
      error: "Impossible d'annuler une inscription déjà enregistrée sur place.",
    };
  }

  await prisma.eventRegistration.update({
    where: { id: registration.id },
    data: { status: "CANCELLED" },
  });

  return { success: true, data: undefined };
}
