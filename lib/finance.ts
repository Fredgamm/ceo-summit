import { computeMRR } from "@/lib/admin-dashboard";

/** E8-T10 — pure computations for the admin finances page. */

export interface MembershipForFinance {
  planId: string | null;
  price: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Real MRR per plan — reuses the same spread-over-term logic as the global
 * MRR (E8-T02). Phase 1 offres dynamiques (30 juillet 2026) — replaces the
 * old `computeMRRByTier`'s fixed 3-key `Record<Tier, ...>` bucket, which
 * couldn't represent a 5th/6th admin-created plan. Groups by `planId`
 * instead; a `null` planId (a membership that predates the Phase 0 backfill
 * somehow) buckets under the `"unknown"` key rather than being dropped.
 */
export function computeMRRByPlan(memberships: MembershipForFinance[]): Map<string, number> {
  const byPlan = new Map<string, MembershipForFinance[]>();
  for (const m of memberships) {
    const key = m.planId ?? "unknown";
    const bucket = byPlan.get(key) ?? [];
    bucket.push(m);
    byPlan.set(key, bucket);
  }

  return new Map([...byPlan.entries()].map(([planId, ms]) => [planId, computeMRR(ms)]));
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
