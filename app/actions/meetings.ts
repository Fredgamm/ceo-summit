"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { meetingEventIdFor, missingMeetingProfileFields } from "@/lib/meeting-participation";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Module 21 lot 3 (8 oct. 2026) — « Mes créneaux » : le participant active
 * les créneaux où il est disponible (opt-in, D3). Désactiver ne touche ni
 * une demande en cours ni un rendez-vous confirmé (RG-13). Toutes les
 * règles sont vérifiées ici, pas seulement à l'affichage.
 */

function revalidateMine() {
  revalidatePath("/profil");
}

/**
 * Participant de l'événement par son offre (`meetingEventIdFor`),
 * réservation ouverte (publiée, événement non terminé).
 */
async function checkParticipation(userId: string, eventId: string, now: Date) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { date: true, endDate: true, meetingSetup: { select: { status: true } } },
  });
  if (!event || event.meetingSetup?.status !== "PUBLISHED") {
    return "Les rendez-vous de cet événement ne sont pas ouverts.";
  }
  if ((event.endDate ?? event.date) < now) return "L'événement est terminé.";
  if ((await meetingEventIdFor(userId)) !== eventId) {
    return "Les rendez-vous de cet événement sont réservés aux participants inscrits par une offre active liée à l'événement.";
  }
  return null;
}

function profileError(missing: string[]) {
  return `Complétez votre profil avant d'activer des créneaux (${missing.join(", ")}).`;
}

export async function toggleMeetingSlot(slotId: string, active: boolean): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return { success: false, error: viewerResult.error };
  const viewer = viewerResult.viewer;
  const now = new Date();

  const slot = await prisma.meetingTimeSlot.findUnique({
    where: { id: slotId },
    select: { eventId: true, status: true, startTime: true },
  });
  if (!slot || slot.status !== "PUBLISHED")
    return { success: false, error: "Créneau introuvable." };
  if (slot.startTime <= now) return { success: false, error: "Ce créneau a déjà commencé." };

  const participationError = await checkParticipation(viewer.id, slot.eventId, now);
  if (participationError) return { success: false, error: participationError };

  if (active) {
    const missing = missingMeetingProfileFields(viewer);
    if (missing.length > 0) return { success: false, error: profileError(missing) };

    const existing = await prisma.meetingParticipantSlot.findUnique({
      where: { slotId_userId: { slotId, userId: viewer.id } },
      select: { status: true },
    });
    if (!existing) {
      await prisma.meetingParticipantSlot.create({
        data: { slotId, userId: viewer.id, status: "FREE" },
      });
    } else if (existing.status === "INACTIVE") {
      await prisma.meetingParticipantSlot.updateMany({
        where: { slotId, userId: viewer.id, status: "INACTIVE" },
        data: { status: "FREE" },
      });
    }
  } else {
    // Passage conditionnel FREE → INACTIVE : une demande arrivée entre-temps
    // (FREE → PENDING) n'est jamais écrasée (RG-13).
    const { count } = await prisma.meetingParticipantSlot.updateMany({
      where: { slotId, userId: viewer.id, status: "FREE" },
      data: { status: "INACTIVE" },
    });
    if (count === 0) {
      const current = await prisma.meetingParticipantSlot.findUnique({
        where: { slotId_userId: { slotId, userId: viewer.id } },
        select: { status: true },
      });
      if (current?.status === "PENDING" || current?.status === "BOOKED") {
        return {
          success: false,
          error:
            current.status === "PENDING"
              ? "Une demande de rendez-vous est en cours sur ce créneau : répondez-y d'abord."
              : "Un rendez-vous est confirmé sur ce créneau.",
        };
      }
    }
  }

  revalidateMine();
  return { success: true, data: undefined };
}

/**
 * « Tout activer » / « Tout désactiver » pour un événement : seuls les
 * créneaux publiés à venir sont concernés, et seuls les créneaux libres ou
 * inactifs changent (RG-13).
 */
export async function setAllMeetingSlots(
  eventId: string,
  active: boolean
): Promise<ActionResult<{ changed: number }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return { success: false, error: viewerResult.error };
  const viewer = viewerResult.viewer;
  const now = new Date();

  const participationError = await checkParticipation(viewer.id, eventId, now);
  if (participationError) return { success: false, error: participationError };

  const upcoming = { eventId, status: "PUBLISHED" as const, startTime: { gt: now } };

  if (!active) {
    const { count } = await prisma.meetingParticipantSlot.updateMany({
      where: { userId: viewer.id, status: "FREE", slot: upcoming },
      data: { status: "INACTIVE" },
    });
    revalidateMine();
    return { success: true, data: { changed: count } };
  }

  const missing = missingMeetingProfileFields(viewer);
  if (missing.length > 0) return { success: false, error: profileError(missing) };

  const slots = await prisma.meetingTimeSlot.findMany({ where: upcoming, select: { id: true } });
  const [created, reactivated] = await prisma.$transaction([
    prisma.meetingParticipantSlot.createMany({
      data: slots.map((s) => ({ slotId: s.id, userId: viewer.id, status: "FREE" as const })),
      skipDuplicates: true,
    }),
    prisma.meetingParticipantSlot.updateMany({
      where: { userId: viewer.id, status: "INACTIVE", slot: upcoming },
      data: { status: "FREE" },
    }),
  ]);

  revalidateMine();
  return { success: true, data: { changed: created.count + reactivated.count } };
}
