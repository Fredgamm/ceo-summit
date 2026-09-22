/**
 * Deux modes de tarification, et rien d'autre (audit du 22 septembre 2026,
 * `conception/12`) :
 *
 * - `FIXED_BUNDLE` — forfait fixe : `priceAr`, quel que soit l'effectif.
 *   C'est le mode de toutes les offres principales du catalogue (Bronze,
 *   Gold, Platinum…), dont le nombre de places est fixé par l'admin via
 *   `Plan.maxTeamMembers`. Rien n'est demandé à l'acheteur au checkout.
 * - `PER_PARTICIPANT` — offre groupement : `priceAr` par personne, à partir
 *   de `minParticipants` (ex. Groupement 10 = 750 €/pers. dès 10 personnes).
 *   C'est le seul cas où l'acheteur déclare un effectif au checkout, parce
 *   que le prix en dépend par nature.
 *
 * Le mode `TIERED_GROUP` (paliers dégressifs au sein d'une même offre,
 * 14 septembre 2026) a été retiré le 22 septembre : jamais utilisé par
 * aucune offre, et remplacé par deux offres groupement distinctes.
 *
 * Fonctions pures (pas de Prisma ici) pour rester testables sans base de
 * données, même convention que lib/onboarding-status.ts.
 */

export interface PricingPlan {
  priceAr: number;
  minParticipants: number | null;
  pricingMode?: "PER_PARTICIPANT" | "FIXED_BUNDLE" | null;
}

/**
 * Montant dû. `pricingMode` non renseigné vaut forfait fixe : une offre
 * créée sans mode explicite ne doit jamais se mettre à facturer à la
 * personne dans le dos de l'admin (c'était le comportement historique,
 * corrigé le 22 septembre — voir `conception/12` §2.1).
 */
export function computeDueAmount(plan: PricingPlan, declaredParticipants: number): number {
  if (plan.pricingMode === "PER_PARTICIPANT") return plan.priceAr * declaredParticipants;
  return plan.priceAr;
}

/**
 * `PER_PARTICIPANT` : l'effectif déclaré doit atteindre le seuil de l'offre
 * (`minParticipants` nul = aucun seuil). Tout autre mode : sans objet, un
 * forfait n'a pas de seuil.
 */
export function meetsMinParticipants(plan: PricingPlan, declaredParticipants: number): boolean {
  if (plan.pricingMode !== "PER_PARTICIPANT") return true;
  return declaredParticipants >= (plan.minParticipants ?? 1);
}
