import { zonedDayKey } from "@/lib/event-timezone";

/**
 * Module 21 lot 4 (8 oct. 2026) — règles d'une demande de rendez-vous
 * (conception/21 §3.3). Logique pure, testée à part.
 */

/** RG-08 — motif obligatoire. */
export const MEETING_REASON_MIN = 10;
export const MEETING_REASON_MAX = 500;

/** RG-09 — demandes en attente par demandeur (D12). */
export const MAX_PENDING_REQUESTS = 10;

const HOUR = 3600 * 1000;

/**
 * RG-06 / D13 — échéance de réponse :
 * - demande envoyée le jour même du créneau (dans le fuseau de l'événement) :
 *   à l'heure du créneau ;
 * - demande envoyée un jour précédent : 48 h après l'envoi, ramenées à
 *   10 minutes avant le créneau si c'est plus tôt.
 */
export function meetingRequestExpiry(sentAt: Date, slotStart: Date, timeZone: string): Date {
  if (zonedDayKey(sentAt, timeZone) === zonedDayKey(slotStart, timeZone)) return slotStart;
  const in48h = new Date(sentAt.getTime() + 48 * HOUR);
  const tenBefore = new Date(slotStart.getTime() - 10 * 60 * 1000);
  return in48h < tenBefore ? in48h : tenBefore;
}
