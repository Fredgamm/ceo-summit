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

export interface FinanceTransaction {
  id: string;
  source: "COMPANY" | "EVENT";
  memberName: string;
  description: string;
  amount: number;
  method: string;
  date: Date;
}

/**
 * Paiements entreprise qui comptent comme recette : seulement CONFIRMED. Un
 * paiement REJECTED n'a jamais été encaissé — l'inclure gonflait l'export
 * comptable et la liste "Paiements récents", qui n'ont pas de colonne statut.
 */
export const RECORDED_COMPANY_PAYMENT_WHERE = { status: "CONFIRMED" } as const;

/**
 * Seul le paiement de l'offre fixe le prix de l'abonnement : un supplément de
 * participants (`upsellQuantity` non nul) s'ajoute à côté, il ne le remplace
 * pas. Sert à retrouver le dernier paiement d'offre pour le MRR.
 */
export const SUBSCRIPTION_PRICE_PAYMENT_WHERE = {
  ...RECORDED_COMPANY_PAYMENT_WHERE,
  upsellQuantity: null,
} as const;

export interface CompanyPaymentForFinance {
  id: string;
  amount: number;
  method: string;
  createdAt: Date;
  upsellQuantity: number | null;
  upsellPlan: { name: string } | null;
  companySubscription: { company: { name: string }; plan: { name: string } };
}

export function companyPaymentToTransaction(p: CompanyPaymentForFinance): FinanceTransaction {
  const description =
    p.upsellQuantity != null
      ? `Supplément ${p.upsellPlan?.name ?? "participants"} × ${p.upsellQuantity}`
      : `Offre ${p.companySubscription.plan.name}`;
  return {
    id: p.id,
    source: "COMPANY",
    memberName: p.companySubscription.company.name,
    description,
    amount: p.amount,
    method: p.method,
    date: p.createdAt,
  };
}

/** Includes Prisma attendus par {@link companyPaymentToTransaction}. */
export const COMPANY_PAYMENT_FINANCE_INCLUDE = {
  upsellPlan: { select: { name: true } },
  companySubscription: {
    include: { company: { select: { name: true } }, plan: { select: { name: true } } },
  },
} as const;

/** Merge heterogeneous payment sources into one feed, most recent first — same rationale as buildActivityFeed. */
export function mergeFinanceTransactions(
  transactions: FinanceTransaction[],
  limit = 30
): FinanceTransaction[] {
  return [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
