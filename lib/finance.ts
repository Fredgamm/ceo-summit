import type { Tier } from "@prisma/client";

import { computeMRR } from "@/lib/admin-dashboard";

/** E8-T10 — pure computations for the admin finances page. */

export interface MembershipForFinance {
  tier: Tier;
  price: number;
  startDate: Date;
  endDate: Date;
}

/** Real MRR per tier — reuses the same spread-over-term logic as the global MRR (E8-T02). */
export function computeMRRByTier(memberships: MembershipForFinance[]): Record<Tier, number> {
  const byTier: Record<Tier, MembershipForFinance[]> = { MEMBER: [], EXECUTIVE: [], CHAIRMAN: [] };
  for (const m of memberships) byTier[m.tier].push(m);

  return {
    MEMBER: computeMRR(byTier.MEMBER),
    EXECUTIVE: computeMRR(byTier.EXECUTIVE),
    CHAIRMAN: computeMRR(byTier.CHAIRMAN),
  };
}

/**
 * "Abonnements expirant dans 30/60/90j" — cumulative from now (endDate within
 * the next N days), matching the wireframe's increasing counts (7/14/22).
 */
export function buildExpiringWithinDays(days: number, now: Date): { gt: Date; lte: Date } {
  return { gt: now, lte: new Date(now.getTime() + days * 24 * 60 * 60 * 1000) };
}

export interface FinanceTransaction {
  id: string;
  source: "MEMBERSHIP" | "EVENT" | "CREDITS";
  memberName: string;
  description: string;
  amount: number;
  method: string;
  date: Date;
}

/** Merge heterogeneous payment sources into one feed, most recent first — same rationale as buildActivityFeed. */
export function mergeFinanceTransactions(
  transactions: FinanceTransaction[],
  limit = 30
): FinanceTransaction[] {
  return [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
