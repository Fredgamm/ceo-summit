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
  /** Montant en Ariary, tel qu'enregistré. */
  amount: number;
  /** Taux EUR→Ar au moment du paiement ; nul pour les paiements antérieurs au 7 oct. 2026. */
  eurToArRate: number | null;
  /** Prix officiel en euros de ce qui a été payé (offre × unités), si l'offre en a un. */
  officialEur: number | null;
  method: string;
  date: Date;
}

export interface EuroAmount {
  amountEur: number;
  rate: number;
  /** Vrai quand le taux du paiement n'a pas été enregistré et que le taux du jour le remplace. */
  rateEstimated: boolean;
}

/**
 * Rapport QA du 7 oct. 2026 (§4.2) — montant en euros de l'export : le prix
 * officiel de l'offre quand il existe (décision client : 25 000 € pour Gold,
 * pas une reconversion de l'Ariary), sinon le montant en Ariary converti au
 * taux du moment du paiement. Le taux affiché est celui du paiement ; pour les
 * paiements enregistrés avant sa conservation, celui du jour (`fallbackRate`),
 * signalé comme estimé.
 */
export function toEuroAmount(transaction: FinanceTransaction, fallbackRate: number): EuroAmount {
  const rate = transaction.eurToArRate ?? fallbackRate;
  const amountEur = transaction.officialEur ?? transaction.amount / rate;
  return {
    amountEur: Math.round(amountEur * 100) / 100,
    rate,
    rateEstimated: transaction.eurToArRate == null,
  };
}

interface PriceablePlan {
  priceAr: number;
  priceEur: number | null;
  pricingMode: string | null;
}

/**
 * Prix officiel en euros d'un paiement d'offre. Pour une offre au participant,
 * le nombre de participants payés se déduit du montant (prix unitaire × n),
 * qui ne change plus une fois le paiement soumis.
 */
export function officialOfferEur(plan: PriceablePlan, amountAr: number): number | null {
  if (plan.priceEur == null) return null;
  if (plan.pricingMode !== "PER_PARTICIPANT" || plan.priceAr <= 0) return plan.priceEur;
  return plan.priceEur * Math.max(1, Math.round(amountAr / plan.priceAr));
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
  eurToArRate: number | null;
  method: string;
  createdAt: Date;
  upsellQuantity: number | null;
  upsellPlan: { name: string; priceEur: number | null } | null;
  companySubscription: { company: { name: string }; plan: { name: string } & PriceablePlan };
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
    eurToArRate: p.eurToArRate,
    officialEur:
      p.upsellQuantity != null
        ? p.upsellPlan?.priceEur != null
          ? p.upsellPlan.priceEur * p.upsellQuantity
          : null
        : officialOfferEur(p.companySubscription.plan, p.amount),
    method: p.method,
    date: p.createdAt,
  };
}

export interface EventRegistrationForFinance {
  id: string;
  eurToArRate: number | null;
  paymentMethod: string | null;
  createdAt: Date;
  user: { name: string };
  event: { title: string; price: number };
}

export function eventRegistrationToTransaction(r: EventRegistrationForFinance): FinanceTransaction {
  return {
    id: r.id,
    source: "EVENT",
    memberName: r.user.name,
    description: r.event.title,
    amount: r.event.price,
    eurToArRate: r.eurToArRate,
    // Les événements n'ont qu'un prix en Ariary : conversion au taux du paiement.
    officialEur: null,
    method: r.paymentMethod ?? "",
    date: r.createdAt,
  };
}

/** Includes Prisma attendus par {@link companyPaymentToTransaction}. */
export const COMPANY_PAYMENT_FINANCE_INCLUDE = {
  upsellPlan: { select: { name: true, priceEur: true } },
  companySubscription: {
    include: {
      company: { select: { name: true } },
      plan: { select: { name: true, priceAr: true, priceEur: true, pricingMode: true } },
    },
  },
} as const;

/** Merge heterogeneous payment sources into one feed, most recent first — same rationale as buildActivityFeed. */
export function mergeFinanceTransactions(
  transactions: FinanceTransaction[],
  limit = 30
): FinanceTransaction[] {
  return [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
