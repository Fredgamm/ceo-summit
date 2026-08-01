/**
 * Phase 2ter (1er août 2026) — les offres entreprise sont tarifées par
 * participant, pas au forfait fixe (ex. "Light corporate pass" : 2 250 000
 * Ar/participant, réservé aux entreprises inscrivant ≥10 participants).
 * Fonctions pures (pas de Prisma ici) pour rester testables sans base de
 * données, même convention que lib/onboarding-status.ts.
 */

export interface PricingPlan {
  priceAr: number;
  minParticipants: number | null;
}

/** Montant dû = prix unitaire × nombre réel de participants (propriétaire inclus). */
export function computeDueAmount(plan: PricingPlan, headcount: number): number {
  return plan.priceAr * headcount;
}

/** `minParticipants` null = aucun seuil (offre individuelle ou sans minimum). */
export function meetsMinParticipants(plan: PricingPlan, headcount: number): boolean {
  return headcount >= (plan.minParticipants ?? 1);
}
