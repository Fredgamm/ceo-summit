import type { PlanPricingMode } from "@prisma/client";

/** Statuts d'abonnement qui donnent encore accès à la plateforme (RG-12). */
const BADGE_ELIGIBLE_STATUSES = ["ACTIVE", "EXPIRED"];

export interface OfferBadgeSubscription {
  status: string;
  plan: { name: string; pricingMode: PlanPricingMode | null };
}

/**
 * Rapport QA du 7 oct. 2026 (§6.2) — seules les offres à prix fixe
 * (sponsors : Platinum, Gold, Silver, Bronze, partenaires institutionnels)
 * donnent un badge sur les profils, avec le nom de l'offre comme libellé.
 * Les offres au prix par participant (groupements, Executive Pass, Early
 * Bird) n'en donnent pas. Lu sur le mode de tarification réglé dans l'admin,
 * jamais sur un nom d'offre.
 */
export function offerBadgeLabel(
  subscription: OfferBadgeSubscription | null | undefined
): string | null {
  if (!subscription || !BADGE_ELIGIBLE_STATUSES.includes(subscription.status)) return null;
  if (subscription.plan.pricingMode === "PER_PARTICIPANT") return null;
  return subscription.plan.name;
}
