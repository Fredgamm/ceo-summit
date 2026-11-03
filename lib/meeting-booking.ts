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

/**
 * Module 21 lots 5 et 8 (3 nov. 2026) — statut affiché d'une demande ou d'un
 * rendez-vous (§3.2). « Terminé » est calculé (D5) ; une demande en attente
 * dont l'échéance est passée est déjà « expirée » à la lecture (RG-06), même
 * si la tâche planifiée ne l'a pas encore traitée.
 */
export type MeetingDisplayStatus =
  "PENDING" | "CONFIRMED" | "COMPLETED" | "DECLINED" | "EXPIRED" | "WITHDRAWN" | "CANCELLED";

export function meetingDisplayStatus(
  booking: { status: string; expiresAt: Date; endTime: Date },
  now = new Date()
): MeetingDisplayStatus {
  if (booking.status === "PENDING" && booking.expiresAt <= now) return "EXPIRED";
  if (booking.status === "CONFIRMED" && booking.endTime <= now) return "COMPLETED";
  return booking.status as MeetingDisplayStatus;
}

/** RG-04 — le téléphone de l'autre participant n'est visible qu'après confirmation. */
export function canSeeMeetingContact(status: MeetingDisplayStatus): boolean {
  return status === "CONFIRMED" || status === "COMPLETED";
}

/** Filtres de « Mes rendez-vous » (P5) ; « À venir » par défaut (D16). */
export const MEETING_FILTERS = [
  { value: "upcoming", label: "À venir" },
  { value: "pending", label: "En attente" },
  { value: "confirmed", label: "Confirmés" },
  { value: "past", label: "Passés" },
  { value: "declined", label: "Refusés" },
  { value: "expired", label: "Expirés" },
  { value: "all", label: "Tous" },
] as const;

export type MeetingFilter = (typeof MEETING_FILTERS)[number]["value"];

export function matchesMeetingFilter(status: MeetingDisplayStatus, filter: MeetingFilter): boolean {
  switch (filter) {
    case "upcoming":
      return status === "PENDING" || status === "CONFIRMED";
    case "pending":
      return status === "PENDING";
    case "confirmed":
      return status === "CONFIRMED";
    case "past":
      return status === "COMPLETED";
    case "declined":
      return status === "DECLINED";
    case "expired":
      return status === "EXPIRED";
    case "all":
      return true;
  }
}
