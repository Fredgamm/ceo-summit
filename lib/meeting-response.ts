import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { expireMeetingBooking, releaseMeetingSlots } from "@/lib/meeting-expiry";
import {
  sendMeetingConfirmedEmails,
  sendMeetingDeclinedEmail,
  sendMeetingExpiredEmails,
} from "@/lib/meeting-emails";
import { meetingEventIdFor } from "@/lib/meeting-participation";
import { meetingDisplayStatus } from "@/lib/meeting-booking";
import { hashMeetingToken } from "@/lib/meeting-token";

/**
 * Module 21 lots 5, 7 et 7 bis — réponse à une demande de rendez-vous, depuis
 * « Mes rendez-vous » (le membre connecté) ou depuis les boutons de l'email
 * (le destinataire, identifié par son jeton). Seul le destinataire accepte ou
 * refuse, seul le demandeur retire (RG-05). Le statut passe de « en attente »
 * au nouveau statut par une mise à jour conditionnelle : deux réponses
 * simultanées (ou une réponse et un retrait) ne peuvent pas réussir toutes
 * les deux. Dans la même transaction, les deux créneaux passent en « réservé »
 * (acceptation) ou redeviennent libres (refus, retrait, expiration : RG-07).
 * Les emails partent ensuite, sans faire attendre la personne.
 */

export type MeetingDecision = "accept" | "decline" | "withdraw";

type Result = { success: true; data: undefined } | { success: false; error: string };

const DECISION_STATUS = {
  accept: "CONFIRMED",
  decline: "DECLINED",
  withdraw: "WITHDRAWN",
} as const;

class NoLongerPendingError extends Error {}

export const NO_LONGER_PENDING = "Cette demande n'est plus en attente.";

/** Un email qui échoue ne remonte jamais jusqu'à la personne (déjà journalisé). */
function notify(task: Promise<unknown>, what: string) {
  task.catch((err) => console.error(`[meeting-email] ${what}`, err));
}

export async function respondToMeeting(
  input: {
    bookingId: string;
    actorId: string;
    decision: MeetingDecision;
    /** Faux pour la page publique de l'email : elle affiche elle-même le résultat. */
    revalidate?: boolean;
  },
  now = new Date()
): Promise<Result> {
  const { bookingId, actorId, decision, revalidate = true } = input;

  const booking = await prisma.meetingBooking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      eventId: true,
      requesterId: true,
      recipientId: true,
      expiresAt: true,
      event: { select: { date: true, endDate: true } },
    },
  });
  if (!booking || (booking.requesterId !== actorId && booking.recipientId !== actorId)) {
    return { success: false, error: "Demande introuvable." };
  }
  // RG-05
  if (decision === "withdraw" && booking.requesterId !== actorId) {
    return { success: false, error: "Seul l'auteur de la demande peut la retirer." };
  }
  if (decision !== "withdraw" && booking.recipientId !== actorId) {
    return { success: false, error: "Seul le destinataire peut répondre à cette demande." };
  }
  if (booking.status !== "PENDING") return { success: false, error: NO_LONGER_PENDING };

  // RG-06 — échéance passée : la demande expire ici même si la tâche
  // planifiée (lib/meeting-expiry.ts) ne l'a pas encore traitée.
  if (booking.expiresAt <= now) {
    if (await expireMeetingBooking(bookingId)) {
      notify(sendMeetingExpiredEmails(bookingId), "expiration");
    }
    if (revalidate) revalidateBoth(booking, actorId);
    return { success: false, error: "Cette demande a expiré : le créneau est de nouveau libre." };
  }
  // RG-11 — lecture seule après la fin de l'événement.
  if ((booking.event.endDate ?? booking.event.date) < now) {
    return { success: false, error: "L'événement est terminé." };
  }
  // RG-02 — le destinataire doit toujours participer pour accepter.
  if (decision === "accept" && (await meetingEventIdFor(actorId)) !== booking.eventId) {
    return {
      success: false,
      error:
        "Les rendez-vous sont réservés aux participants inscrits par une offre active liée à l'événement.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.meetingBooking.updateMany({
        where: { id: bookingId, status: "PENDING" },
        data: {
          status: DECISION_STATUS[decision],
          ...(decision === "withdraw" ? {} : { respondedAt: now }),
        },
      });
      if (count !== 1) throw new NoLongerPendingError();
      if (decision === "accept") {
        await tx.meetingParticipantSlot.updateMany({
          where: { bookingId, status: "PENDING" },
          data: { status: "BOOKED" },
        });
      } else {
        await releaseMeetingSlots(tx, bookingId);
      }
    });
  } catch (err) {
    if (err instanceof NoLongerPendingError) return { success: false, error: NO_LONGER_PENDING };
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: `meeting.${decision}`,
      targetType: "MeetingBooking",
      targetId: bookingId,
    },
  });
  if (decision === "accept") notify(sendMeetingConfirmedEmails(bookingId), "confirmation");
  if (decision === "decline") notify(sendMeetingDeclinedEmail(bookingId), "refus");
  if (revalidate) revalidateBoth(booking, actorId);
  return { success: true, data: undefined };
}

function revalidateBoth(booking: { requesterId: string; recipientId: string }, actorId: string) {
  const partnerId = booking.requesterId === actorId ? booking.recipientId : booking.requesterId;
  revalidatePath("/profil");
  revalidatePath(`/membres/${partnerId}`);
}

/**
 * Ce qu'affiche la page `/rendez-vous/repondre/[jeton]` avant de répondre :
 * lecture seule, sans effet sur la demande. `null` si le jeton est inconnu.
 */
export async function loadMeetingByToken(token: string) {
  const booking = await prisma.meetingBooking.findUnique({
    where: { decisionTokenHash: hashMeetingToken(token) },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      recipientId: true,
      slot: { select: { startTime: true, endTime: true } },
      event: { select: { title: true, timezone: true } },
      requester: { select: { name: true, company: { select: { name: true } } } },
    },
  });
  if (!booking) return null;
  return {
    id: booking.id,
    recipientId: booking.recipientId,
    status: meetingDisplayStatus(
      { status: booking.status, expiresAt: booking.expiresAt, endTime: booking.slot.endTime },
      new Date()
    ),
    requesterName: booking.requester.name,
    requesterCompany: booking.requester.company?.name ?? null,
    eventTitle: booking.event.title,
    timezone: booking.event.timezone,
    start: booking.slot.startTime,
    end: booking.slot.endTime,
  };
}

/** Réponse par les boutons de l'email : le destinataire est celui du jeton (RG-15). */
export async function respondToMeetingByToken(
  token: string,
  choice: "accepter" | "decliner"
): Promise<Result> {
  const meeting = await loadMeetingByToken(token);
  if (!meeting) return { success: false, error: "Ce lien n'est pas valide." };
  return respondToMeeting({
    bookingId: meeting.id,
    actorId: meeting.recipientId,
    decision: choice === "accepter" ? "accept" : "decline",
    revalidate: false,
  });
}
