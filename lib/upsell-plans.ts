import type { Prisma } from "@prisma/client";

/**
 * Une offre est proposable en supplément d'un abonnement déjà actif si elle
 * est explicitement marquée `isUpsell` (ex. Executive Pass, vendu à l'unité —
 * configuration manuelle, rien ne le rend supplément par nature) OU si c'est
 * une offre Groupement (`PER_PARTICIPANT`) — celles-ci sont utilisables en
 * supplément automatiquement, sans configuration admin : leur tarif par
 * personne a de toute façon un sens quel que soit le moment de l'achat.
 */
export function isUpsellEligible(plan: {
  isUpsell: boolean;
  pricingMode?: string | null;
}): boolean {
  return plan.isUpsell || plan.pricingMode === "PER_PARTICIPANT";
}

export const UPSELL_ELIGIBLE_WHERE: Prisma.PlanWhereInput = {
  isActive: true,
  OR: [{ isUpsell: true }, { pricingMode: "PER_PARTICIPANT" }],
};
