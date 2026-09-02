import type { Prisma, Tier } from "@prisma/client";

import { LEGACY_TIER_ORDER } from "@/lib/plan-access";

/** E6-T01 — pure filter/sort/visibility logic for `/deal-room`, same rationale as lib/catalogue.ts. */

export const DEAL_ROOM_PAGE_SIZE = 12;

/**
 * Coût en crédits Deal Room d'une prise de contact (bypass total pour
 * Chairman, voir app/actions/deal-room.ts). Correctif (7 août 2026, audit)
 * — cette valeur était répétée en dur dans 8+ endroits (l'action elle-même
 * ×3, plus la copie de 4 composants UI) sans source unique.
 *
 * Valeur de repli uniquement — le coût réel appliqué est configurable par
 * l'admin (`/admin/parametres` → Tarifs & Règles, 7 août 2026) et lu via
 * `lib/deal-room-settings.ts::getDealRoomContactCost()`. Cette constante ne
 * sert que tant qu'aucun admin n'a encore défini de valeur en base.
 */
export const DEAL_ROOM_CONTACT_COST_DEFAULT = 1;

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
