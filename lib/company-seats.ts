import type { Plan } from "@prisma/client";

/**
 * 22 septembre 2026 (`conception/12` §3.2) — nombre total de places d'un
 * abonnement : le quota de l'offre (fixe en `FIXED_BUNDLE`, déclaré et payé
 * en `PER_PARTICIPANT`) plus les places achetées en supplément
 * (`extraSeats`, offres `isUpsell`). `null` = aucune limite (offre sans
 * quota renseigné).
 */
export function seatCap(subscription: {
  plan: Pick<Plan, "pricingMode" | "maxTeamMembers">;
  declaredParticipants: number | null;
  extraSeats: number;
}): number | null {
  const base =
    subscription.plan.pricingMode === "PER_PARTICIPANT"
      ? subscription.declaredParticipants
      : subscription.plan.maxTeamMembers;
  return base == null ? null : base + subscription.extraSeats;
}
