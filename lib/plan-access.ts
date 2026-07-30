import type { Tier } from "@prisma/client";

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — single source of truth for
 * the legacy 3-tier ordering, replacing two independently-hardcoded arrays
 * that used to live in lib/deal-room-query.ts (`TIER_ORDER`) and
 * lib/utils.ts (`TIER_RANK`). Kept only as the fallback ranking for
 * Membership/Event/Opportunity rows that predate this migration and have no
 * `planId`/`minPlanId`/`visibilityPlanId` set yet — anything wired to a real
 * `Plan` row should compare `Plan.rank` directly instead.
 */
export const LEGACY_TIER_ORDER: Tier[] = ["MEMBER", "EXECUTIVE", "CHAIRMAN"];

export const LEGACY_TIER_RANK: Record<Tier, number> = {
  MEMBER: 1,
  EXECUTIVE: 2,
  CHAIRMAN: 3,
};

export function legacyTierRank(tier: string | null | undefined): number {
  if (!tier) return 0;
  return LEGACY_TIER_RANK[tier as Tier] ?? 0;
}

/** Canonical "does this rank satisfy this minimum" comparison. */
export function meetsMinRank(viewerRank: number, minRank: number): boolean {
  return viewerRank >= minRank;
}

/**
 * Best-effort mapping from an arbitrary Plan.rank down to the closest legacy
 * Tier bucket — used only to keep the still-required, non-nullable legacy
 * `Event.minTier`/`Opportunity.visibility` columns populated with something
 * sane when a form now saves against a custom (4th+) Plan instead of one of
 * the original 3 tiers. Not a source of truth once `minPlanId`/
 * `visibilityPlanId` is set — those win at read time.
 */
export function nearestLegacyTier(rank: number): Tier {
  if (rank >= LEGACY_TIER_RANK.CHAIRMAN) return "CHAIRMAN";
  if (rank >= LEGACY_TIER_RANK.EXECUTIVE) return "EXECUTIVE";
  return "MEMBER";
}
