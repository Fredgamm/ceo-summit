import type { MeetingAvailability } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { zonedDayKey } from "@/lib/event-timezone";
import { activeEventOf } from "@/lib/event-participation";

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

/**
 * Les créneaux de rendez-vous B2B sont réservés aux événements « Summit
 * annuel » (demande du client, 8 oct. 2026).
 */
export const MEETING_EVENT_TYPE = "SUMMIT" as const;

/**
 * Événement pour lequel le membre peut avoir des créneaux, ou `null`. Il
 * faut, comme pour l'inscription (module 21 §3.0 étape 3) :
 * - un compte actif ;
 * - une entreprise dont l'offre est active (statut effectif) et liée à un
 *   événement « Summit annuel » ;
 * - une inscription confirmée à cet événement, faite par cette offre (le
 *   gérant ne l'a pas retiré de la liste).
 * Le profil minimum (RG-02) est vérifié en plus pour activer ou demander.
 */
export async function meetingEventIdFor(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      company: {
        select: {
          subscription: {
            select: {
              status: true,
              plan: {
                select: { id: true, eventId: true, event: { select: { date: true, type: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (user?.status !== "ACTIVE") return null;
  const subscription = user.company?.subscription;
  const active = activeEventOf(subscription);
  if (!active || subscription?.plan.event?.type !== MEETING_EVENT_TYPE) return null;

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: active.eventId, userId } },
    select: { status: true, planId: true },
  });
  if (registration?.status !== "CONFIRMED" || registration.planId !== active.planId) return null;
  return active.eventId;
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
 * L'événement « Summit annuel » de l'offre du participant (`meetingEventIdFor`),
 * si ses créneaux sont publiés et qu'il n'est pas terminé (RG-11), avec ses
 * disponibilités. Les créneaux désactivés par l'admin n'apparaissent pas.
 */
export async function loadMyMeetingEvents(
  userId: string,
  now = new Date()
): Promise<MyMeetingEvent[]> {
  const eventId = await meetingEventIdFor(userId);
  if (!eventId) return [];
  const events = await prisma.event.findMany({
    where: {
      id: eventId,
      type: MEETING_EVENT_TYPE,
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
