import type { Prisma, Tier } from "@prisma/client";

import { LEGACY_TIER_ORDER } from "@/lib/plan-access";

/** E6-T01 — pure filter/sort/visibility logic for `/deal-room`, same rationale as lib/catalogue.ts. */

export const DEAL_ROOM_PAGE_SIZE = 12;

export interface DealRoomReferentials {
  validTypes: readonly string[];
  validSectors: readonly string[];
  validCountries: readonly string[];
}

export interface DealRoomSearchParams {
  type?: string;
  sector?: string;
  pays?: string;
  budget?: string;
  tri?: string;
  page?: string;
}

export interface DealRoomQuery {
  where: Prisma.OpportunityWhereInput;
  orderBy: Prisma.OpportunityOrderByWithRelationInput;
  skip: number;
  take: number;
  page: number;
}

/**
 * Décision d'architecture (sept. 2026, conception/09) — accès égal pour tout
 * membre dont l'entreprise a une offre active/validée : toute opportunité
 * publiée est visible dès qu'un tier existe (peu importe lequel), plus
 * seulement celles à son rang ou en dessous. `viewerTier` non nul veut déjà
 * dire "offre active/expirée mais valable" (getViewerTierFromCompany,
 * RG-12) — c'est cette présence qui compte, plus le rang. `Opportunity.
 * visibility` reste en base et dans le formulaire de publication, juste
 * plus filtrant.
 */
export function allowedVisibilities(viewerTier: Tier | null | undefined): Tier[] {
  return viewerTier != null ? [...LEGACY_TIER_ORDER] : [];
}

/**
 * Rapport QA du 1er oct. 2026 (§2.4) — le tri par défaut (aucun `tri`
 * explicite dans l'URL) n'est plus purement chronologique : priorité aux
 * opportunités de ma propre entreprise, puis à celles d'entreprises du
 * même secteur d'activité (`Company.sector`, pas `Opportunity.sector` —
 * deux champs distincts), le reste suit dans l'ordre déjà choisi
 * (`createdAt desc` par défaut). Un tri explicite (budget, échéance)
 * reste un choix délibéré de l'utilisateur et n'est jamais réordonné.
 */
export function isDefaultSort(params: DealRoomSearchParams): boolean {
  return !params.tri || !["budget_asc", "budget_desc", "deadline"].includes(params.tri);
}

/**
 * Nombre maximum d'opportunités (déjà filtrées par `where`) rechargées en
 * mémoire pour appliquer le tri de pertinence ci-dessus avant pagination —
 * Prisma ne peut pas exprimer "est-ce la même entreprise que le viewer ?"
 * dans un `orderBy` déclaratif. Large pour l'échelle réaliste de la
 * plateforme ; au-delà, le tri de pertinence ne s'applique qu'aux
 * `DEFAULT_SORT_SCAN_LIMIT` opportunités les plus récentes plutôt qu'à la
 * liste entière (dégradation progressive, pas une erreur).
 */
export const DEFAULT_SORT_SCAN_LIMIT = 300;

interface RelevanceInput {
  authorCompanyId: string | null;
  authorCompanySector: string | null;
}

function relevanceScore(
  o: RelevanceInput,
  viewerCompanyId: string | null,
  viewerSector: string | null
): number {
  if (viewerCompanyId && o.authorCompanyId === viewerCompanyId) return 0;
  if (viewerSector && o.authorCompanySector === viewerSector) return 1;
  return 2;
}

/**
 * Tri stable : à score égal, conserve l'ordre d'entrée (déjà `createdAt
 * desc` au moment de l'appel) — Array.prototype.sort est stable depuis
 * ES2019/Node 12, pas besoin de comparateur secondaire explicite.
 */
export function sortByCompanyRelevance<T extends RelevanceInput>(
  opportunities: T[],
  viewerCompanyId: string | null,
  viewerSector: string | null
): T[] {
  return [...opportunities].sort(
    (a, b) =>
      relevanceScore(a, viewerCompanyId, viewerSector) -
      relevanceScore(b, viewerCompanyId, viewerSector)
  );
}

export function buildDealRoomQuery(
  params: DealRoomSearchParams,
  viewerTier: Tier | null | undefined,
  referentials: DealRoomReferentials
): DealRoomQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const where: Prisma.OpportunityWhereInput = {
    status: "PUBLISHED",
    visibility: { in: allowedVisibilities(viewerTier) },
  };

  if (params.type && referentials.validTypes.includes(params.type)) {
    where.type = params.type;
  }
  if (params.sector && referentials.validSectors.includes(params.sector)) {
    where.sector = params.sector;
  }
  if (params.pays && referentials.validCountries.includes(params.pays)) {
    where.country = params.pays;
  }

  if (params.budget === "lt50m") {
    where.budget = { lt: 50_000_000 };
  } else if (params.budget === "50-200m") {
    where.budget = { gte: 50_000_000, lte: 200_000_000 };
  } else if (params.budget === "gt200m") {
    where.budget = { gt: 200_000_000 };
  }

  const orderBy: Prisma.OpportunityOrderByWithRelationInput =
    params.tri === "budget_asc"
      ? { budget: "asc" }
      : params.tri === "budget_desc"
        ? { budget: "desc" }
        : params.tri === "deadline"
          ? { deadline: "asc" }
          : { createdAt: "desc" };

  return {
    where,
    orderBy,
    skip: (page - 1) * DEAL_ROOM_PAGE_SIZE,
    take: DEAL_ROOM_PAGE_SIZE,
    page,
  };
}
