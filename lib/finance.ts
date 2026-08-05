import { computeMRR } from "@/lib/admin-dashboard";

/** E8-T10 — pure computations for the admin finances page. */

export interface CompanySubscriptionForFinance {
  planId: string | null;
  /** Montant réellement payé (dernière CompanyPayment CONFIRMED), pas Plan.priceAr brut. */
  price: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Real MRR per plan — reuses the same spread-over-term logic as the global
 * MRR (E8-T02). Groups by `planId`; a `null` planId (ne devrait pas arriver
 * pour un CompanySubscription réel, `planId` est requis en base — garde
 * défensive) bucket sous `"unknown"` plutôt que d'être ignoré.
 */
export function computeMRRByPlan(
  subscriptions: CompanySubscriptionForFinance[]
): Map<string, number> {
  const byPlan = new Map<string, CompanySubscriptionForFinance[]>();
  for (const s of subscriptions) {
    const key = s.planId ?? "unknown";
    const bucket = byPlan.get(key) ?? [];
    bucket.push(s);
    byPlan.set(key, bucket);
  }

  return new Map([...byPlan.entries()].map(([planId, ss]) => [planId, computeMRR(ss)]));
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
  source: "COMPANY" | "EVENT" | "CREDITS";
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
