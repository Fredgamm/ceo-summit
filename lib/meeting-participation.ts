import type { MeetingAvailability } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { zonedDayKey } from "@/lib/event-timezone";

/**
 * Module 21 lot 3 (8 oct. 2026) — côté participant : éligibilité (RG-02) et
 * données de l'onglet « Mes créneaux » (P4).
 */

/** RG-02 — profil minimum : nom, entreprise, téléphone, e-mail. Libellés des champs manquants. */
export function missingMeetingProfileFields(user: {
  name: string | null;
  email: string | null;
  phone: string | null;
  companyId: string | null;
}): string[] {
  const missing: string[] = [];
  if (!user.name?.trim()) missing.push("nom");
  if (!user.companyId) missing.push("entreprise");
  if (!user.phone?.trim()) missing.push("téléphone");
  if (!user.email?.trim()) missing.push("e-mail");
  return missing;
}

/** Statut affiché d'un créneau pour le participant (pas de ligne = inactif, D3). */
export type MySlotStatus = MeetingAvailability;

export interface MySlot {
  id: string;
  startTime: Date;
  endTime: Date;
  status: MySlotStatus;
  /** Créneau déjà commencé : plus modifiable. */
  started: boolean;
}

export interface MyMeetingEvent {
  id: string;
  title: string;
  timezone: string;
  zone: string;
  accessInstructions: string;
  days: { day: string; slots: MySlot[] }[];
  counts: { total: number; active: number; pending: number; booked: number };
}

/**
 * Événements dont le participant est inscrit (inscription confirmée), dont
 * les créneaux sont publiés et qui ne sont pas terminés (RG-11), avec ses
 * disponibilités. Les créneaux désactivés par l'admin n'apparaissent pas.
 */
export async function loadMyMeetingEvents(
  userId: string,
  now = new Date()
): Promise<MyMeetingEvent[]> {
  const events = await prisma.event.findMany({
    where: {
      registrations: { some: { userId, status: "CONFIRMED" } },
      meetingSetup: { status: "PUBLISHED" },
      OR: [{ endDate: { gte: now } }, { endDate: null, date: { gte: now } }],
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      title: true,
      timezone: true,
      meetingSetup: { select: { zone: true, accessInstructions: true } },
      meetingSlots: {
        where: { status: "PUBLISHED" },
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          participantSlots: { where: { userId }, select: { status: true } },
        },
      },
    },
  });

  return events.map((event) => {
    const byDay = new Map<string, MySlot[]>();
    const counts = { total: 0, active: 0, pending: 0, booked: 0 };
    for (const slot of event.meetingSlots) {
      const status = slot.participantSlots[0]?.status ?? "INACTIVE";
      counts.total++;
      if (status === "FREE") counts.active++;
      if (status === "PENDING") counts.pending++;
      if (status === "BOOKED") counts.booked++;
      const day = zonedDayKey(slot.startTime, event.timezone);
      byDay.set(day, [
        ...(byDay.get(day) ?? []),
        {
          id: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status,
          started: slot.startTime <= now,
        },
      ]);
    }
    return {
      id: event.id,
      title: event.title,
      timezone: event.timezone,
      zone: event.meetingSetup?.zone ?? "",
      accessInstructions: event.meetingSetup?.accessInstructions ?? "",
      days: [...byDay.entries()].map(([day, slots]) => ({ day, slots })),
      counts,
    };
  });
}
