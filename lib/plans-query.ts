import type { Event, Plan, PlanPriceBracket } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/// 14 septembre 2026 (TIERED_GROUP) — toute lecture de `Plan` destinée au
/// calcul ou à l'affichage d'un prix doit inclure `priceBrackets`
/// (lib/company-payment-amount.ts en dépend pour ce mode).
export type PlanWithBrackets = Plan & { priceBrackets: PlanPriceBracket[] };
export type PlanWithEvent = PlanWithBrackets & { event: Event | null };

const BRACKETS_INCLUDE = { priceBrackets: { orderBy: { displayOrder: "asc" as const } } };

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — single place every page/
 * action reads the active offer catalogue from, replacing the "3 fixed
 * tiers" assumption that used to be hardcoded across ~9 filter dropdowns,
 * the event/opportunity forms, and lib/platform-settings.ts.
 *
 * `selfServiceOnly` (Phase 2ter, 1er août 2026) — exclut les offres de
 * sponsoring (`isSelfService: false`), créées pour le suivi admin mais sans
 * parcours de paiement en libre-service. À utiliser partout où un
 * utilisateur choisit lui-même une offre (wizard entreprise, sélection
 * individuelle, résolution de lien profond) ; laisser à `false`/omis pour
 * les vues admin qui doivent tout voir.
 *
 * `eventId` (Phase 2quater, 1er août 2026) — une offre peut être rattachée
 * à un évènement précis (`Plan.eventId`) plutôt qu'être une offre standard
 * plateforme. Non précisé : ne renvoie que les offres **standard**
 * (`eventId: null`) — les sélecteurs génériques (wizard entreprise, fourche
 * individuelle) ne doivent pas se retrouver mélangés avec le catalogue d'un
 * évènement passé. Passer un id explicite pour lister les offres d'un
 * évènement précis (page publique de l'évènement, admin évènement).
 */
export async function getActivePlans(opts?: {
  selfServiceOnly?: boolean;
  eventId?: string;
}): Promise<PlanWithBrackets[]> {
  return prisma.plan.findMany({
    where: {
      isActive: true,
      ...(opts?.selfServiceOnly ? { isSelfService: true } : {}),
      eventId: opts?.eventId ?? null,
    },
    orderBy: [{ displayOrder: "asc" }, { rank: "asc" }],
    include: BRACKETS_INCLUDE,
  });
}

export async function getPlanById(id: string): Promise<PlanWithBrackets | null> {
  return prisma.plan.findUnique({ where: { id }, include: BRACKETS_INCLUDE });
}

/**
 * Phase 2ter (1er août 2026) — résolution du lien profond public
 * (`/inscription?offre=<slug>`). Ne résout que les offres actives et en
 * libre-service : un slug de sponsoring ou d'offre désactivée retombe sur
 * `null` (le site continue de s'afficher normalement, sans pré-sélection),
 * pas une erreur bloquante.
 *
 * `event` inclus (UC-11, 5 août 2026) pour la preview enrichie et les
 * métadonnées Open Graph du lien partagé (app/inscription/page.tsx).
 */
export async function getPlanBySlug(slug: string): Promise<PlanWithEvent | null> {
  return prisma.plan.findFirst({
    where: { slug, isActive: true, isSelfService: true },
    include: { event: true, ...BRACKETS_INCLUDE },
  });
}

/**
 * All plans (active + inactive), for the admin list — same ordering as
 * getActivePlans. `eventId` (Phase 2quater) filters to one event's offers
 * when provided; omitted returns every plan regardless of event scope
 * (unlike getActivePlans, the admin list should show everything by default).
 */
export async function getAllPlans(eventId?: string): Promise<PlanWithBrackets[]> {
  return prisma.plan.findMany({
    where: eventId ? { eventId } : undefined,
    orderBy: [{ displayOrder: "asc" }, { rank: "asc" }],
    include: BRACKETS_INCLUDE,
  });
}
