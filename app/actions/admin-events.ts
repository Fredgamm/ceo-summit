"use server";

import { revalidatePath } from "next/cache";
import type { EventStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { eventFormSchema } from "@/lib/validations/event";
import { parseSpeakersText } from "@/lib/event-content";
import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/event-timezone";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/** E3-T05 — CRUD événements admin. Zoom: pas d'intégration API réelle (pas de clés
 * sandbox) — zoomMeetingId reste un champ texte saisi manuellement, comme pour E3-T02.
 * Emails automatiques J-7/J-1 : pas d'infra de tâche planifiée dans ce projet
 * (aucun cron), donc pas construits — ce serait EX-T03 (monitoring/infra), qui n'existe
 * pas non plus.
 */
function toEventData(
  input: unknown
): { error: string } | { data: Prisma.EventUncheckedCreateInput } {
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  // Module 21 D19 — saisies lues dans le fuseau de l'événement.
  const date = zonedLocalToUtc(f.date, f.timezone);
  const endDate = zonedLocalToUtc(f.endDate, f.timezone);
  if (!date || !endDate) return { error: "Dates invalides" };
  return {
    data: {
      title: f.title,
      type: f.type,
      description: f.description,
      speakers: parseSpeakersText(f.speakersText) as unknown as Prisma.InputJsonValue,
      location: f.location,
      isOnline: f.isOnline,
      zoomMeetingId: f.zoomMeetingId || null,
      timezone: f.timezone,
      date,
      endDate,
      capacity: f.capacity,
      price: f.price,
      imageUrl: f.imageUrl || null,
    },
  };
}

export async function createEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { userId: adminId } = await requireAdmin("evenements");

  const result = toEventData(input);
  if ("error" in result) return { success: false, error: result.error };

  const event = await prisma.event.create({ data: { ...result.data, status: "DRAFT" } });

  await prisma.auditLog.create({
    data: { actorId: adminId, action: "event.create", targetType: "Event", targetId: event.id },
  });

  revalidatePath("/admin/evenements");
  return { success: true, data: { id: event.id } };
}

export async function updateEvent(eventId: string, input: unknown): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("evenements");

  const result = toEventData(input);
  if ("error" in result) return { success: false, error: result.error };

  const previous = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  if (!previous) return { success: false, error: "Événement introuvable" };

  const newTimezone = result.data.timezone ?? previous.timezone;
  if (newTimezone === previous.timezone) {
    await prisma.event.update({ where: { id: eventId }, data: result.data });
  } else {
    // Changement de fuseau : les sessions du Programme et les créneaux de
    // rendez-vous gardent l'heure affichée (« 14h00 » reste 14h00, dans le
    // nouveau fuseau), comme le début et la fin saisis dans le formulaire.
    const [sessions, slots] = await Promise.all([
      prisma.eventSession.findMany({
        where: { eventId },
        select: { id: true, startTime: true, endTime: true },
      }),
      prisma.meetingTimeSlot.findMany({
        where: { eventId },
        select: { id: true, startTime: true, endTime: true },
      }),
    ]);
    const shift = (d: Date) =>
      zonedLocalToUtc(utcToZonedLocal(d, previous.timezone), newTimezone) ?? d;
    await prisma.$transaction([
      prisma.event.update({ where: { id: eventId }, data: result.data }),
      ...sessions.map((s) =>
        prisma.eventSession.update({
          where: { id: s.id },
          data: { startTime: shift(s.startTime), endTime: shift(s.endTime) },
        })
      ),
      ...slots.map((s) =>
        prisma.meetingTimeSlot.update({
          where: { id: s.id },
          data: { startTime: shift(s.startTime), endTime: shift(s.endTime) },
        })
      ),
    ]);
  }

  await prisma.auditLog.create({
    data: { actorId: adminId, action: "event.update", targetType: "Event", targetId: eventId },
  });

  revalidatePath("/admin/evenements");
  revalidatePath(`/admin/evenements/${eventId}`);
  return { success: true, data: undefined };
}

export async function setEventStatus(eventId: string, status: EventStatus): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("evenements");

  await prisma.event.update({ where: { id: eventId }, data: { status } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "event.set_status",
      targetType: "Event",
      targetId: eventId,
      metadata: { status },
    },
  });

  revalidatePath("/admin/evenements");
  revalidatePath(`/admin/evenements/${eventId}`);
  return { success: true, data: undefined };
}
