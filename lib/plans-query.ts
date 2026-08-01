import type { Plan, PlanScope } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
 */
export async function getActivePlans(
  scope?: PlanScope,
  opts?: { selfServiceOnly?: boolean }
): Promise<Plan[]> {
  return prisma.plan.findMany({
    where: {
      isActive: true,
      ...(scope ? { scope } : {}),
      ...(opts?.selfServiceOnly ? { isSelfService: true } : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { rank: "asc" }],
  });
}

export async function getPlanById(id: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { id } });
}

/**
 * Phase 2ter (1er août 2026) — résolution du lien profond public
 * (`/inscription?offre=<slug>`). Ne résout que les offres actives et en
 * libre-service : un slug de sponsoring ou d'offre désactivée retombe sur
 * `null` (le site continue de s'afficher normalement, sans pré-sélection),
 * pas une erreur bloquante.
 */
export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  return prisma.plan.findFirst({ where: { slug, isActive: true, isSelfService: true } });
}

/** All plans (active + inactive), for the admin list — same ordering as getActivePlans. */
export async function getAllPlans(): Promise<Plan[]> {
  return prisma.plan.findMany({ orderBy: [{ displayOrder: "asc" }, { rank: "asc" }] });
}
