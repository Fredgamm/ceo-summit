"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { meetingEventIdFor, missingMeetingProfileFields } from "@/lib/meeting-participation";
import {
  MAX_PENDING_REQUESTS,
  MEETING_REASON_MAX,
  MEETING_REASON_MIN,
  meetingRequestExpiry,
} from "@/lib/meeting-booking";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Module 21 lot 4 (8 oct. 2026) — demande de rendez-vous depuis l'onglet
 * « Rendez-vous événement » du profil d'un participant (conception/21 P2).
 * Toutes les règles sont vérifiées ici (RG-01 à RG-03, RG-06, RG-08 à
 * RG-11). La demande bloque, en une transaction, le créneau du destinataire
 * et celui du demandeur par un passage conditionnel « libre → en attente » :
 * deux demandes simultanées ne peuvent pas réussir toutes les deux.
 */

const requestSchema = z.object({
  slotId: z.string().min(1),
  recipientId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(MEETING_REASON_MIN, `Le motif doit contenir au moins ${MEETING_REASON_MIN} caractères.`)
    .max(MEETING_REASON_MAX, `Le motif ne doit pas dépasser ${MEETING_REASON_MAX} caractères.`),
});

class SlotTakenError extends Error {}
class RequesterBusyError extends Error {}

export async function requestMeeting(input: unknown): Promise<ActionResult<{ bookingId: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return { success: false, error: viewerResult.error };
  const viewer = viewerResult.viewer;

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  }
  const { slotId, recipientId, reason } = parsed.data;
  const now = new Date();

  // RG-01
  if (recipientId === viewer.id) {
    return { success: false, error: "Vous ne pouvez pas demander un rendez-vous à vous-même." };
  }

  const slot = await prisma.meetingTimeSlot.findUnique({
    where: { id: slotId },
    select: {
      eventId: true,
      status: true,
      startTime: true,
      event: {
        select: {
          date: true,
          endDate: true,
          timezone: true,
          meetingSetup: { select: { status: true } },
        },
      },
    },
  });
  if (!slot || slot.status !== "PUBLISHED" || slot.event.meetingSetup?.status !== "PUBLISHED") {
    return { success: false, error: "Ce créneau n'est pas disponible." };
  }
  // RG-11
  if ((slot.event.endDate ?? slot.event.date) < now) {
    return { success: false, error: "L'événement est terminé." };
  }
  if (slot.startTime <= now) return { success: false, error: "Ce créneau a déjà commencé." };

  // RG-02 — les deux participants, par une offre active liée à cet événement.
  const [viewerEventId, recipientEventId, recipient] = await Promise.all([
    meetingEventIdFor(viewer.id),
    meetingEventIdFor(recipientId),
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { name: true, email: true, phone: true, companyId: true },
    }),
  ]);
  if (viewerEventId !== slot.eventId) {
    return {
      success: false,
      error:
        "Les rendez-vous sont réservés aux participants inscrits par une offre active liée à l'événement.",
    };
  }
  if (recipientEventId !== slot.eventId || !recipient) {
    return {
      success: false,
      error: "Ce membre ne participe pas aux rendez-vous de cet événement.",
    };
  }
  const viewerMissing = missingMeetingProfileFields(viewer);
  if (viewerMissing.length > 0) {
    return {
      success: false,
      error: `Complétez votre profil avant de demander un rendez-vous (${viewerMissing.join(", ")}).`,
    };
  }
  if (missingMeetingProfileFields(recipient).length > 0) {
    return { success: false, error: "Ce membre ne peut pas encore recevoir de demande." };
  }

  // RG-09 et RG-10
  const [pendingSent, existingBetween] = await Promise.all([
    prisma.meetingBooking.count({ where: { requesterId: viewer.id, status: "PENDING" } }),
    prisma.meetingBooking.findFirst({
      where: {
        eventId: slot.eventId,
        status: { in: ["PENDING", "CONFIRMED"] },
        OR: [
          { requesterId: viewer.id, recipientId },
          { requesterId: recipientId, recipientId: viewer.id },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (pendingSent >= MAX_PENDING_REQUESTS) {
    return {
      success: false,
      error: `Vous avez déjà ${MAX_PENDING_REQUESTS} demandes en attente : attendez une réponse ou retirez-en une.`,
    };
  }
  if (existingBetween) {
    return {
      success: false,
      error: "Une demande ou un rendez-vous existe déjà avec ce membre pour cet événement.",
    };
  }

  const expiresAt = meetingRequestExpiry(now, slot.startTime, slot.event.timezone);

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.meetingBooking.create({
        data: {
          eventId: slot.eventId,
          slotId,
          requesterId: viewer.id,
          recipientId,
          reason,
          expiresAt,
        },
        select: { id: true },
      });
      // Pas de ligne = créneau libre (actif par défaut) : on matérialise les
      // lignes manquantes, puis on bloque les deux créneaux conditionnellement.
      await tx.meetingParticipantSlot.createMany({
        data: [
          { slotId, userId: recipientId, status: "FREE" },
          { slotId, userId: viewer.id, status: "FREE" },
        ],
        skipDuplicates: true,
      });
      const recipientLock = await tx.meetingParticipantSlot.updateMany({
        where: { slotId, userId: recipientId, status: "FREE" },
        data: { status: "PENDING", bookingId: created.id },
      });
      if (recipientLock.count !== 1) throw new SlotTakenError();
      const requesterLock = await tx.meetingParticipantSlot.updateMany({
        where: { slotId, userId: viewer.id, status: "FREE" },
        data: { status: "PENDING", bookingId: created.id },
      });
      if (requesterLock.count !== 1) throw new RequesterBusyError();
      return created;
    });

    // TODO lot 7 (emails) : « Nouvelle demande de rendez-vous » au destinataire.
    revalidatePath(`/membres/${recipientId}`);
    revalidatePath("/profil");
    return { success: true, data: { bookingId: booking.id } };
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return { success: false, error: "Ce créneau vient d'être pris ou n'est plus disponible." };
    }
    if (err instanceof RequesterBusyError) {
      return {
        success: false,
        error:
          "Vous n'êtes pas disponible sur ce créneau (désactivé dans « Mes créneaux » ou déjà occupé).",
      };
    }
    throw err;
  }
}

/**
 * Module 21 lots 5 et 8 (3 nov. 2026) — réponse à une demande depuis « Mes
 * rendez-vous » (P3, P5). Seul le destinataire accepte ou refuse, seul le
 * demandeur retire (RG-05). Le statut passe de « en attente » au nouveau
 * statut par une mise à jour conditionnelle : deux réponses simultanées (ou
 * une réponse et un retrait) ne peuvent pas réussir toutes les deux. Dans la
 * même transaction, les deux créneaux passent en « réservé » (acceptation)
 * ou redeviennent libres (refus, retrait, expiration : RG-07).
 */

type Decision = "accept" | "decline" | "withdraw";

const DECISION_STATUS = {
  accept: "CONFIRMED",
  decline: "DECLINED",
  withdraw: "WITHDRAWN",
} as const;

class NoLongerPendingError extends Error {}

const NO_LONGER_PENDING = "Cette demande n'est plus en attente.";

export async function acceptMeeting(bookingId: string): Promise<ActionResult> {
  return decide(bookingId, "accept");
}

export async function declineMeeting(bookingId: string): Promise<ActionResult> {
  return decide(bookingId, "decline");
}

export async function withdrawMeeting(bookingId: string): Promise<ActionResult> {
  return decide(bookingId, "withdraw");
}

async function decide(bookingId: string, decision: Decision): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return { success: false, error: viewerResult.error };
  const viewer = viewerResult.viewer;
  const now = new Date();

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
  if (!booking || (booking.requesterId !== viewer.id && booking.recipientId !== viewer.id)) {
    return { success: false, error: "Demande introuvable." };
  }
  // RG-05
  if (decision === "withdraw" && booking.requesterId !== viewer.id) {
    return { success: false, error: "Seul l'auteur de la demande peut la retirer." };
  }
  if (decision !== "withdraw" && booking.recipientId !== viewer.id) {
    return { success: false, error: "Seul le destinataire peut répondre à cette demande." };
  }
  if (booking.status !== "PENDING") return { success: false, error: NO_LONGER_PENDING };

  // RG-06 — échéance passée : la demande expire ici même si la tâche
  // planifiée (lot 6) ne l'a pas encore traitée.
  if (booking.expiresAt <= now) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.meetingBooking.updateMany({
        where: { id: bookingId, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      if (count === 1) await releaseSlots(tx, bookingId);
    });
    revalidateBoth(booking, viewer.id);
    return { success: false, error: "Cette demande a expiré : le créneau est de nouveau libre." };
  }
  // RG-11 — lecture seule après la fin de l'événement.
  if ((booking.event.endDate ?? booking.event.date) < now) {
    return { success: false, error: "L'événement est terminé." };
  }
  // RG-02 — le destinataire doit toujours participer pour accepter.
  if (decision === "accept" && (await meetingEventIdFor(viewer.id)) !== booking.eventId) {
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
        await releaseSlots(tx, bookingId);
      }
    });
  } catch (err) {
    if (err instanceof NoLongerPendingError) return { success: false, error: NO_LONGER_PENDING };
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId: viewer.id,
      action: `meeting.${decision}`,
      targetType: "MeetingBooking",
      targetId: bookingId,
    },
  });
  // TODO lot 7 (emails) : confirmation aux deux avec .ics, ou refus au demandeur.
  revalidateBoth(booking, viewer.id);
  return { success: true, data: undefined };
}

/** RG-07 — les créneaux bloqués par la demande redeviennent libres. */
async function releaseSlots(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.meetingParticipantSlot.updateMany({
    where: { bookingId },
    data: { status: "FREE", bookingId: null },
  });
}

function revalidateBoth(booking: { requesterId: string; recipientId: string }, viewerId: string) {
  const partnerId = booking.requesterId === viewerId ? booking.recipientId : booking.requesterId;
  revalidatePath("/profil");
  revalidatePath(`/membres/${partnerId}`);
}
