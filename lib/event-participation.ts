import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { resolveEmail } from "@/lib/email-template-resolver";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import { withEventRegistrationLock } from "@/lib/event-registration-lock";
import { formatDateFr } from "@/lib/utils";

/**
 * Inscription des participants d'une entreprise à l'événement de son offre
 * (module 18 §4.9). Depuis le 8 octobre 2026, elle ne se fait plus d'office
 * au paiement ni à l'arrivée d'un collaborateur : c'est la liste validée par
 * le gérant (`app/actions/company-participants.ts`) qui inscrit.
 */

type SubscriptionForEvent = {
  status: Parameters<typeof computeEffectiveStatus>[0];
  plan: { id: string; eventId: string | null; event?: { date: Date } | null };
};

/** Événement de l'offre si l'abonnement est `ACTIVE` (statut effectif, RG-12), sinon `null`. */
export function activeEventOf(subscription: SubscriptionForEvent | null | undefined) {
  if (!subscription) return null;
  const effectiveStatus = computeEffectiveStatus(
    subscription.status,
    subscription.plan.event?.date
  );
  if (effectiveStatus !== "ACTIVE" || !subscription.plan.eventId) return null;
  return { eventId: subscription.plan.eventId, planId: subscription.plan.id };
}

/**
 * Inscrit un membre à l'événement, sous verrou et dans la capacité restante.
 * `null` si l'événement est complet ou introuvable. `wasConfirmed` :
 * l'inscription était déjà confirmée avant l'appel (aucun email à renvoyer).
 */
export async function registerCompanyMemberToEvent(
  userId: string,
  eventId: string,
  planId: string
) {
  return withEventRegistrationLock(eventId, async () => {
    const existingRegistration = await prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    const [event, takenSpots] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.eventRegistration.count({
        where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
      }),
    ]);
    // Une inscription annulée ne réserve plus de place : comme une
    // nouvelle, elle doit tenir dans la capacité restante.
    const holdsSpot = existingRegistration != null && existingRegistration.status !== "CANCELLED";
    const hasRoom = holdsSpot || !event || takenSpots < event.capacity;
    if (!hasRoom || !event) return null;

    const registration = await prisma.eventRegistration.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { status: "CONFIRMED", paymentStatus: "PAID", planId },
      create: { eventId, userId, status: "CONFIRMED", paymentStatus: "PAID", planId },
    });
    return {
      registration,
      event,
      wasConfirmed: existingRegistration?.status === "CONFIRMED",
    };
  });
}

export async function sendEventRegistrationEmail(
  user: { email: string; name: string },
  event: { title: string; date: Date; timezone: string; isOnline: boolean; location: string },
  logPrefix: string
) {
  try {
    const resolvedEmail = await resolveEmail("event-registration", {
      memberName: user.name,
      eventTitle: event.title,
      eventDateLabel: formatDateFr(event.date, event.timezone),
      eventLocation: event.isOnline ? "En ligne" : event.location,
    });
    if (resolvedEmail) await sendTransactionalEmail({ to: user.email, ...resolvedEmail });
  } catch (err) {
    console.error(`[${logPrefix}] failed to send event registration email`, err);
  }
}
