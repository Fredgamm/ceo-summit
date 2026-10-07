import type { Prisma } from "@prisma/client";

/**
 * Module 20 — une « offre partenaire » (partenaire institutionnel, média…)
 * est une offre active à 0, non proposée à l'inscription. Attribuée par
 * l'admin sur invitation, sans paiement. Aucun nom d'offre dans le code :
 * une nouvelle offre partenaire se crée dans /admin/plans.
 */
export const PARTNER_OFFER_WHERE: Prisma.PlanWhereInput = {
  isActive: true,
  isSelfService: false,
  isUpsell: false,
  priceAr: 0,
};

export function isPartnerOffer(plan: {
  isActive: boolean;
  isSelfService: boolean;
  isUpsell: boolean;
  priceAr: number;
}): boolean {
  return plan.isActive && !plan.isSelfService && !plan.isUpsell && plan.priceAr === 0;
}

/** Durée d'un partenariat : même règle que les autres offres, un an à partir de l'activation. */
export function partnershipEndDate(start: Date): Date {
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return end;
}
