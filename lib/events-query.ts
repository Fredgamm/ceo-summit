import type { Prisma } from "@prisma/client";

/**
 * E3-T01 — pure filter-building logic for `/evenements`, kept separate from
 * the page component for the same reason as lib/catalogue.ts: testable
 * without touching Prisma or the clock in awkward ways.
 */

export interface EventsSearchParams {
  type?: string;
  date?: string;
}

const VALID_TYPES = ["SUMMIT", "DINER", "WEBINAIRE", "RENCONTRE"];

export function buildUpcomingEventsWhere(params: EventsSearchParams): Prisma.EventWhereInput {
  const now = new Date();
  const where: Prisma.EventWhereInput = { status: "PUBLISHED", date: { gte: now } };

  if (params.type && VALID_TYPES.includes(params.type)) {
    where.type = params.type as Prisma.EventWhereInput["type"];
  }

  if (params.date === "mois") {
    where.date = { gte: now, lt: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  } else if (params.date === "trimestre") {
    where.date = { gte: now, lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) };
  } else if (params.date && /^\d{4}$/.test(params.date)) {
    const year = parseInt(params.date, 10);
    where.date = { gte: now, lt: new Date(year + 1, 0, 1) };
  }

  return where;
}

/** Separate section on the same page (backlog: "Événements passés (section séparée)"). */
export function buildPastEventsWhere(): Prisma.EventWhereInput {
  return { status: { in: ["PUBLISHED", "COMPLETED"] }, date: { lt: new Date() } };
}

export type EventCapacityBadge = "complet" | "limite" | "ouvert";

/**
 * Backlog: Badge "Complet" / "Bientôt" / "Places limitées". "Bientôt" reads,
 * in context, as the default "registrations open, plenty of room" state —
 * neither the backlog nor its wireframe defines a fourth, separate meaning
 * for it — so it's modeled here as `"ouvert"`.
 */
export function eventCapacityBadge(capacity: number, takenSpots: number): EventCapacityBadge {
  const spotsLeft = capacity - takenSpots;
  if (spotsLeft <= 0) return "complet";
  if (spotsLeft <= 10) return "limite";
  return "ouvert";
}
