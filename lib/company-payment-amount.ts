/**
 * 4 août 2026 (split plateforme/évènement) — une offre d'évènement a deux
 * modes de tarification possibles : `PER_PARTICIPANT` (prix unitaire ×
 * nombre de participants **déclaré** par l'entreprise, pas le headcount
 * réel — RG-04) ou `FIXED_BUNDLE` (forfait total pour `includedSeats`
 * sièges, indépendant du nombre exact invité). `pricingMode: null` (offre
 * plateforme, ou offre d'évènement créée avant cette évolution) retombe sur
 * l'ancien comportement `PER_PARTICIPANT`. Fonctions pures (pas de Prisma
 * ici) pour rester testables sans base de données, même convention que
 * lib/onboarding-status.ts.
 */

export interface PricingPlan {
  priceAr: number;
  minParticipants: number | null;
  pricingMode?: "PER_PARTICIPANT" | "FIXED_BUNDLE" | null;
  includedSeats?: number | null;
}

/**
 * Montant dû :
 * - `FIXED_BUNDLE` : `priceAr` fixe, quel que soit le nombre déclaré.
 * - `PER_PARTICIPANT` (ou mode non renseigné, comportement historique) :
 *   `priceAr` × `declaredParticipants` (nombre déclaré par l'entreprise,
 *   pas le headcount réel — voir RG-04).
 */
export function computeDueAmount(plan: PricingPlan, declaredParticipants: number): number {
  if (plan.pricingMode === "FIXED_BUNDLE") return plan.priceAr;
  return plan.priceAr * declaredParticipants;
}

/**
 * `FIXED_BUNDLE` : toujours vrai, un forfait n'a pas de seuil minimum de
 * participants (`minParticipants` est sans objet pour ce mode).
 * `PER_PARTICIPANT` : `minParticipants` null = aucun seuil.
 */
export function meetsMinParticipants(plan: PricingPlan, declaredParticipants: number): boolean {
  if (plan.pricingMode === "FIXED_BUNDLE") return true;
  return declaredParticipants >= (plan.minParticipants ?? 1);
}

/**
 * Plafond de sièges pour cette édition — `includedSeats` en `FIXED_BUNDLE`,
 * sinon `null` (pas de plafond propre au mode, seul `Plan.maxTeamMembers`
 * de l'offre plateforme liée s'applique — voir company-invites.ts).
 */
export function seatCap(plan: PricingPlan): number | null {
  return plan.pricingMode === "FIXED_BUNDLE" ? (plan.includedSeats ?? null) : null;
}
