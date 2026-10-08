"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { zonedLocalToUtc } from "@/lib/event-timezone";
import { buildSlotGrid, eventDayKeys } from "@/lib/meeting-slots";
import {
  meetingGridSchema,
  meetingSetupSchema,
  meetingSlotSchema,
} from "@/lib/validations/meeting";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Module 21 lot 2 (8 oct. 2026) — créneaux de rendez-vous B2B d'un
 * événement, côté admin (conception/21 §3.0 étape 4, P1, RG-11, RG-12).
 * Option distincte du Programme (`EventSession`). Les heures sont celles du
 * fuseau de l'événement (D19). Même périmètre RBAC que l'événement.
 */

/** Demandes ou rendez-vous qui bloquent un créneau. */
const ACTIVE_BOOKING = { in: ["PENDING", "CONFIRMED"] as ("PENDING" | "CONFIRMED")[] };

const CANCELLED_BY_ADMIN = "Créneau désactivé par l'organisation.";

function revalidateSlots(eventId: string) {
  revalidatePath(`/admin/evenements/${eventId}/creneaux`);
  revalidatePath(`/admin/evenements/${eventId}/editer`);
  revalidatePath("/admin/rendez-vous");
}

async function loadEvent(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      date: true,
      endDate: true,
      timezone: true,
      isOnline: true,
      meetingSetup: { select: { status: true } },
    },
  });
}

type LoadedEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

/** RG-11 : après la fin de l'événement, le module passe en lecture seule. */
function isOver(event: LoadedEvent, now = new Date()) {
  return (event.endDate ?? event.date) < now;
}

function overlaps(a: { startTime: Date; endTime: Date }, b: { startTime: Date; endTime: Date }) {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export async function saveMeetingSetup(eventId: string, input: unknown): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("evenements");

  const parsed = meetingSetupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const event = await loadEvent(eventId);
  if (!event) return { success: false, error: "Événement introuvable" };
  if (event.isOnline) {
    return {
      success: false,
      error: "Les rendez-vous B2B se tiennent sur place : événement en ligne.",
    };
  }

  await prisma.eventMeetingSetup.upsert({
    where: { eventId },
    create: { eventId, ...parsed.data },
    update: parsed.data,
  });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "meeting.setup", targetType: "Event", targetId: eventId },
  });

  revalidateSlots(eventId);
  return { success: true, data: undefined };
}

/**
 * Génère la grille. Tant que rien n'est publié, elle remplace les créneaux
 * en brouillon ; après publication, elle ajoute les créneaux qui ne
 * chevauchent aucun créneau existant, directement publiés.
 */
export async function generateMeetingSlots(
  eventId: string,
  input: unknown
): Promise<ActionResult<{ created: number; skipped: number }>> {
  const { userId: adminId } = await requireAdmin("evenements");

  const parsed = meetingGridSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const event = await loadEvent(eventId);
  if (!event) return { success: false, error: "Événement introuvable" };
  if (!event.meetingSetup) {
    return { success: false, error: "Enregistrez d'abord la zone RDV et ses indications." };
  }
  if (isOver(event)) return { success: false, error: "L'événement est terminé." };

  const allowedDays = new Set(eventDayKeys(event.date, event.endDate, event.timezone));
  if (parsed.data.days.some((d) => !allowedDays.has(d))) {
    return { success: false, error: "Les créneaux doivent rester dans les dates de l'événement." };
  }

  const grid = buildSlotGrid({ ...parsed.data, timeZone: event.timezone });
  if (!grid.ok) return { success: false, error: grid.error };

  const published = event.meetingSetup.status === "PUBLISHED";
  let toCreate = grid.slots;
  if (published) {
    const existing = await prisma.meetingTimeSlot.findMany({
      where: { eventId },
      select: { startTime: true, endTime: true },
    });
    toCreate = grid.slots.filter((s) => !existing.some((e) => overlaps(s, e)));
  }

  const status = published ? "PUBLISHED" : "DRAFT";
  await prisma.$transaction([
    ...(published
      ? []
      : [prisma.meetingTimeSlot.deleteMany({ where: { eventId, status: "DRAFT" } })]),
    prisma.meetingTimeSlot.createMany({
      data: toCreate.map((s) => ({ eventId, ...s, status })),
      skipDuplicates: true,
    }),
  ]);
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "meeting.generate_slots",
      targetType: "Event",
      targetId: eventId,
      metadata: { created: toCreate.length },
    },
  });

  revalidateSlots(eventId);
  return {
    success: true,
    data: { created: toCreate.length, skipped: grid.slots.length - toCreate.length },
  };
}

export async function addMeetingSlot(eventId: string, input: unknown): Promise<ActionResult> {
  await requireAdmin("evenements");

  const parsed = meetingSlotSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const event = await loadEvent(eventId);
  if (!event) return { success: false, error: "Événement introuvable" };
  if (!event.meetingSetup) {
    return { success: false, error: "Enregistrez d'abord la zone RDV et ses indications." };
  }
  if (isOver(event)) return { success: false, error: "L'événement est terminé." };
  if (!eventDayKeys(event.date, event.endDate, event.timezone).includes(parsed.data.day)) {
    return { success: false, error: "Le créneau doit rester dans les dates de l'événement." };
  }

  const startTime = zonedLocalToUtc(`${parsed.data.day}T${parsed.data.start}`, event.timezone);
  const endTime = zonedLocalToUtc(`${parsed.data.day}T${parsed.data.end}`, event.timezone);
  if (!startTime || !endTime) return { success: false, error: "Horaires invalides" };
  if (endTime <= startTime) {
    return { success: false, error: "L'heure de fin doit être après l'heure de début." };
  }

  const clash = await prisma.meetingTimeSlot.findFirst({
    where: { eventId, startTime: { lt: endTime }, endTime: { gt: startTime } },
    select: { id: true },
  });
  if (clash) return { success: false, error: "Ce créneau chevauche un créneau existant." };

  await prisma.meetingTimeSlot.create({
    data: {
      eventId,
      startTime,
      endTime,
      status: event.meetingSetup.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    },
  });

  revalidateSlots(eventId);
  return { success: true, data: undefined };
}

/** Suppression réservée aux créneaux sans aucune demande : sinon, les désactiver. */
export async function deleteMeetingSlot(slotId: string): Promise<ActionResult> {
  await requireAdmin("evenements");

  const slot = await prisma.meetingTimeSlot.findUnique({
    where: { id: slotId },
    select: { eventId: true, _count: { select: { bookings: true } } },
  });
  if (!slot) return { success: false, error: "Créneau introuvable" };
  if (slot._count.bookings > 0) {
    return {
      success: false,
      error: "Ce créneau a déjà reçu des demandes : désactivez-le plutôt que de le supprimer.",
    };
  }

  await prisma.meetingTimeSlot.delete({ where: { id: slotId } });
  revalidateSlots(slot.eventId);
  return { success: true, data: undefined };
}

/**
 * Désactive (pour tous les participants) ou réactive un créneau. Désactiver
 * un créneau qui porte des demandes ou des rendez-vous exige
 * `confirmCancel` : ils sont alors annulés (RG-12) et les disponibilités des
 * participants sur ce créneau repassent inactives. Réactiver ne rend pas
 * ces disponibilités : chaque participant doit réactiver le créneau.
 */
export async function setMeetingSlotDisabled(
  slotId: string,
  disabled: boolean,
  options: { confirmCancel?: boolean } = {}
): Promise<
  ActionResult<{ cancelled: number }> | { success: false; error: string; activeBookings: number }
> {
  const { userId: adminId } = await requireAdmin("evenements");

  const slot = await prisma.meetingTimeSlot.findUnique({
    where: { id: slotId },
    select: {
      eventId: true,
      status: true,
      event: { select: { meetingSetup: { select: { status: true } } } },
    },
  });
  if (!slot) return { success: false, error: "Créneau introuvable" };

  if (!disabled) {
    if (slot.status !== "DISABLED") return { success: true, data: { cancelled: 0 } };
    const status = slot.event.meetingSetup?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    await prisma.meetingTimeSlot.update({ where: { id: slotId }, data: { status } });
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "meeting.slot_enable",
        targetType: "MeetingTimeSlot",
        targetId: slotId,
      },
    });
    revalidateSlots(slot.eventId);
    return { success: true, data: { cancelled: 0 } };
  }

  const activeBookings = await prisma.meetingBooking.count({
    where: { slotId, status: ACTIVE_BOOKING },
  });
  if (activeBookings > 0 && !options.confirmCancel) {
    return {
      success: false,
      error: `Ce créneau porte ${activeBookings} demande(s) ou rendez-vous : confirmez leur annulation.`,
      activeBookings,
    };
  }

  // TODO lot 7 (emails) : prévenir les participants des demandes annulées.
  await prisma.$transaction([
    prisma.meetingBooking.updateMany({
      where: { slotId, status: ACTIVE_BOOKING },
      data: { status: "CANCELLED", cancelReason: CANCELLED_BY_ADMIN },
    }),
    prisma.meetingParticipantSlot.updateMany({
      where: { slotId },
      data: { status: "INACTIVE", bookingId: null },
    }),
    prisma.meetingTimeSlot.update({ where: { id: slotId }, data: { status: "DISABLED" } }),
  ]);
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "meeting.slot_disable",
      targetType: "MeetingTimeSlot",
      targetId: slotId,
      metadata: { cancelled: activeBookings },
    },
  });

  revalidateSlots(slot.eventId);
  return { success: true, data: { cancelled: activeBookings } };
}

/**
 * Publication : les créneaux en brouillon deviennent visibles des
 * participants, inactifs tant qu'ils ne les activent pas (D3). La
 * réservation est ouverte jusqu'à la fin de l'événement (RG-11).
 */
export async function publishMeetingSlots(
  eventId: string
): Promise<ActionResult<{ published: number }>> {
  const { userId: adminId } = await requireAdmin("evenements");

  const event = await loadEvent(eventId);
  if (!event) return { success: false, error: "Événement introuvable" };
  if (!event.meetingSetup) {
    return { success: false, error: "Enregistrez d'abord la zone RDV et ses indications." };
  }
  if (isOver(event)) return { success: false, error: "L'événement est terminé." };

  const drafts = await prisma.meetingTimeSlot.count({ where: { eventId, status: "DRAFT" } });
  if (drafts === 0 && event.meetingSetup.status !== "PUBLISHED") {
    return { success: false, error: "Générez au moins un créneau avant de publier." };
  }

  // TODO lot 7 (emails) : « Vous participez aux rendez-vous B2B, configurez vos créneaux ».
  await prisma.$transaction([
    prisma.meetingTimeSlot.updateMany({
      where: { eventId, status: "DRAFT" },
      data: { status: "PUBLISHED" },
    }),
    prisma.eventMeetingSetup.update({
      where: { eventId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
  ]);
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "meeting.publish",
      targetType: "Event",
      targetId: eventId,
      metadata: { published: drafts },
    },
  });

  revalidateSlots(eventId);
  return { success: true, data: { published: drafts } };
}
