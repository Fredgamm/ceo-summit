import type { Event, Plan } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PlanWithEvent = Plan & { event: Event | null };

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
 * (`eventId: null`). Ce rattachement n'est plus proposé à l'admin depuis
 * l'audit du 22 septembre 2026 (`conception/12` §2.6) — seules les offres
 * héritées, désactivées, en portent encore un.
 *
 * Audit MVP (25 septembre 2026) — `selfServiceOnly` exclut aussi les offres
 * supplément (`isUpsell: true`, ex. Executive Pass) : elles ne s'achètent
 * qu'en complément d'un abonnement déjà actif, jamais comme offre principale
 * (`conception/12`). Les offres Groupement (`PER_PARTICIPANT`) non marquées
 * `isUpsell` restent, elles, légitimement au catalogue d'inscription.
 */
export async function getActivePlans(opts?: {
  selfServiceOnly?: boolean;
  eventId?: string;
}): Promise<Plan[]> {
  const plans = await prisma.plan.findMany({
    where: {
      isActive: true,
      ...(opts?.selfServiceOnly ? { isSelfService: true, isUpsell: false } : {}),
      // Intégration Evolia (8 oct. 2026) — les offres rattachées à un
      // événement restent au catalogue d'inscription ; on ne filtre par
      // événement que si on le demande.
      ...(opts?.eventId ? { eventId: opts.eventId } : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { rank: "asc" }],
  });
  return plans.map((p) => ({ ...p, name: cleanPlanName(p.name) }));
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
 *
 * `event` inclus (UC-11, 5 août 2026) pour la preview enrichie et les
 * métadonnées Open Graph du lien partagé (app/inscription/page.tsx).
 *
 * Audit MVP (25 septembre 2026) — une offre supplément (`isUpsell`) n'est
 * pas une offre principale : son slug ne pré-sélectionne rien non plus.
 */
export async function getPlanBySlug(slug: string): Promise<PlanWithEvent | null> {
  const plan = await prisma.plan.findFirst({
    where: { slug, isActive: true, isSelfService: true, isUpsell: false },
    include: { event: true },
  });
  return plan ? { ...plan, name: cleanPlanName(plan.name) } : null;
}

/**
 * All plans (active + inactive), for the admin list — same ordering as
 * getActivePlans. `eventId` (Phase 2quater) filters to one event's offers
 * when provided; omitted returns every plan regardless of event scope
 * (unlike getActivePlans, the admin list should show everything by default).
 */
export async function getAllPlans(eventId?: string): Promise<Plan[]> {
  return prisma.plan.findMany({
    where: eventId ? { eventId } : undefined,
    orderBy: [{ displayOrder: "asc" }, { rank: "asc" }],
  });
}

/**
 * Audit MVP (25 septembre 2026) — nom d'offre tel qu'affiché publiquement :
 * retire les astérisques de mise en forme markdown saisis par erreur dans le
 * nom (ex. « Early Bird** (fin : 31 déc 2026) » en production). Le nom est
 * désormais nettoyé à l'enregistrement (app/actions/admin-plans.ts), ceci
 * couvre les offres déjà en base.
 */
export function cleanPlanName(name: string): string {
  return name
    .replace(/\*+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
