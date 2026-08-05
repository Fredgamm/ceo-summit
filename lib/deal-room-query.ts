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
 * Backlog: "Visibilité : Executive voit toutes · Member voit seulement
 * secteurs ouverts" — read as: a Member only sees opportunities the author
 * opened to everyone (`visibility: MEMBER`); Executive/Chairman see any
 * opportunity at or below their own tier.
 */
export function allowedVisibilities(viewerTier: Tier | null | undefined): Tier[] {
  const rank = viewerTier ? LEGACY_TIER_ORDER.indexOf(viewerTier) : -1;
  if (rank < 0) return [];
  return LEGACY_TIER_ORDER.slice(0, rank + 1);
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
