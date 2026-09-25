import type { Prisma } from "@prisma/client";

/**
 * Une offre est proposable en supplément d'un abonnement déjà actif si elle
 * est explicitement marquée `isUpsell` (ex. Executive Pass, vendu à l'unité —
 * configuration manuelle, rien ne le rend supplément par nature) OU si c'est
 * une offre Groupement (`PER_PARTICIPANT`) — celles-ci sont utilisables en
 * supplément automatiquement, sans configuration admin : leur tarif par
 * personne a de toute façon un sens quel que soit le moment de l'achat.
 *
 * Audit MVP (25 septembre 2026) — une offre de sponsoring
 * (`isSelfService: false`) ou désactivée n'est jamais proposable en
 * supplément, même marquée `isUpsell` : elle n'a pas de parcours de paiement
 * en libre-service. Les deux champs sont optionnels pour rester compatible
 * avec les appelants qui ne les chargent pas (non renseigné = pas de refus).
 */
export function isUpsellEligible(plan: {
  isUpsell: boolean;
  pricingMode?: string | null;
  isActive?: boolean;
  isSelfService?: boolean;
}): boolean {
  if (plan.isActive === false || plan.isSelfService === false) return false;
  return plan.isUpsell || plan.pricingMode === "PER_PARTICIPANT";
}

export const UPSELL_ELIGIBLE_WHERE: Prisma.PlanWhereInput = {
  isActive: true,
  isSelfService: true,
  OR: [{ isUpsell: true }, { pricingMode: "PER_PARTICIPANT" }],
};
