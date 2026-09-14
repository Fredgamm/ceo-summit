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
 *
 * 14 septembre 2026 — troisième mode `TIERED_GROUP` : prix unitaire
 * dégressif par palier de taille de groupe (ex. 10-29 participants ->
 * 650 Ar/pers., 30 et plus -> 500 Ar/pers.). Le palier applicable est celui
 * dans lequel tombe `declaredParticipants` ; en-dessous du plus bas palier,
 * l'offre est inéligible (voir `meetsMinParticipants`). Comme pour
 * `Plan.priceAr`/`priceEur`, seul `unitPriceAr` du palier alimente ce
 * calcul — `unitPriceEur` reste purement informatif.
 */

export interface PricingBracket {
  minParticipants: number;
  /** `null` = palier ouvert ("30 et plus"). */
  maxParticipants: number | null;
  unitPriceAr: number;
}

export interface PricingPlan {
  priceAr: number;
  minParticipants: number | null;
  pricingMode?: "PER_PARTICIPANT" | "FIXED_BUNDLE" | "TIERED_GROUP" | null;
  includedSeats?: number | null;
  priceBrackets?: PricingBracket[];
}

/** Palier de `plan.priceBrackets` dans lequel tombe `declaredParticipants`, ou `null`. */
function findBracket(plan: PricingPlan, declaredParticipants: number): PricingBracket | null {
  return (
    (plan.priceBrackets ?? []).find(
      (b) =>
        declaredParticipants >= b.minParticipants &&
        (b.maxParticipants === null || declaredParticipants <= b.maxParticipants)
    ) ?? null
  );
}

/**
 * Montant dû :
 * - `FIXED_BUNDLE` : `priceAr` fixe, quel que soit le nombre déclaré.
 * - `TIERED_GROUP` : prix unitaire du palier atteint × `declaredParticipants`
 *   (le palier est garanti trouvé ici, cette fonction n'étant appelée
 *   qu'après un `meetsMinParticipants` vrai).
 * - `PER_PARTICIPANT` (ou mode non renseigné, comportement historique) :
 *   `priceAr` × `declaredParticipants` (nombre déclaré par l'entreprise,
 *   pas le headcount réel — voir RG-04).
 */
export function computeDueAmount(plan: PricingPlan, declaredParticipants: number): number {
  if (plan.pricingMode === "FIXED_BUNDLE") return plan.priceAr;
  if (plan.pricingMode === "TIERED_GROUP") {
    const bracket = findBracket(plan, declaredParticipants);
    return (bracket?.unitPriceAr ?? 0) * declaredParticipants;
  }
  return plan.priceAr * declaredParticipants;
}

/**
 * `FIXED_BUNDLE` : toujours vrai, un forfait n'a pas de seuil minimum de
 * participants (`minParticipants` est sans objet pour ce mode).
 * `TIERED_GROUP` : vrai seulement si `declaredParticipants` atteint le plus
 * bas des paliers (aucun palier trouvé sinon).
 * `PER_PARTICIPANT` : `minParticipants` null = aucun seuil.
 */
export function meetsMinParticipants(plan: PricingPlan, declaredParticipants: number): boolean {
  if (plan.pricingMode === "FIXED_BUNDLE") return true;
  if (plan.pricingMode === "TIERED_GROUP") return findBracket(plan, declaredParticipants) !== null;
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
