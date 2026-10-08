"use server";

import { revalidatePath } from "next/cache";
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
