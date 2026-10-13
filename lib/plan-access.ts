import type { Prisma, Tier } from "@prisma/client";

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

/** Subset of CompanySubscription that still counts as "has an active platform benefit". */
const TIER_ELIGIBLE_STATUSES = ["ACTIVE", "EXPIRED"] as const;

/**
 * 12 oct. 2026 — membre visible des autres membres (annuaire, « Nouveaux
 * membres ») : compte actif ET entreprise dont le paiement est validé, même
 * règle que l'accès à la plateforme (getViewerTierFromCompany). Un compte
 * qui attend la validation de son paiement n'y apparaît pas encore.
 */
export const MEMBER_WITH_ACCESS_WHERE = {
  status: "ACTIVE",
  company: { subscription: { status: { in: [...TIER_ELIGIBLE_STATUSES] } } },
} satisfies Prisma.UserWhereInput;

export interface CompanyForTier {
  subscription?: {
    status: string;
    plan: {
      rank: number;
      linkedPlatformPlan?: { rank: number } | null;
    };
  } | null;
}

/**
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — remplace
 * `user.memberships[0]?.tier` comme source du tier effectif. Dérivé du rang
 * de l'offre plateforme liée à l'abonnement entreprise (ou de l'offre
 * elle-même si aucun lien plateforme n'est renseigné). `EXPIRED` compte
 * encore : seul l'accès à l'édition d'évènement expire (RG-12), les
 * avantages plateforme (Deal Room, salles) persistent tant que le
 * statut n'est pas `SUSPENDED`/`CANCELLED`/`DRAFT`/`PENDING_*`.
 */
export function getViewerTierFromCompany(company: CompanyForTier | null | undefined): Tier | null {
  const sub = company?.subscription;
  if (
    !sub ||
    !TIER_ELIGIBLE_STATUSES.includes(sub.status as (typeof TIER_ELIGIBLE_STATUSES)[number])
  ) {
    return null;
  }
  const rank = sub.plan.linkedPlatformPlan?.rank ?? sub.plan.rank;
  return nearestLegacyTier(rank);
}

/** Same as {@link getViewerTierFromCompany} but returns the numeric rank directly. */
export function getViewerRankFromCompany(company: CompanyForTier | null | undefined): number {
  const sub = company?.subscription;
  if (
    !sub ||
    !TIER_ELIGIBLE_STATUSES.includes(sub.status as (typeof TIER_ELIGIBLE_STATUSES)[number])
  ) {
    return 0;
  }
  return sub.plan.linkedPlatformPlan?.rank ?? sub.plan.rank;
}

/** Prisma `include` shape needed to compute the viewer's tier from their company. */
export const VIEWER_TIER_INCLUDE = {
  company: {
    include: {
      subscription: {
        include: { plan: { include: { linkedPlatformPlan: true } } },
      },
    },
  },
} as const;
