"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { selectPlan } from "@/app/actions/company-subscription";
import type { PlanWithBrackets } from "@/lib/plans-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatPlanPrice } from "@/lib/utils";

/** Prix affiché pour une offre `TIERED_GROUP` — fourchette des prix unitaires de ses paliers. */
function tieredPriceLabel(plan: PlanWithBrackets): string {
  if (plan.priceBrackets.length === 0) return "Tarif sur devis";
  const cheapest = plan.priceBrackets.reduce((min, b) =>
    b.unitPriceAr < min.unitPriceAr ? b : min
  );
  const priciest = plan.priceBrackets.reduce((max, b) =>
    b.unitPriceAr > max.unitPriceAr ? b : max
  );
  if (cheapest.unitPriceAr === priciest.unitPriceAr) {
    return `${formatPlanPrice({ priceAr: cheapest.unitPriceAr, priceEur: cheapest.unitPriceEur })} / participant`;
  }
  return `${formatPlanPrice({ priceAr: priciest.unitPriceAr, priceEur: priciest.unitPriceEur })} - ${formatPlanPrice({ priceAr: cheapest.unitPriceAr, priceEur: cheapest.unitPriceEur })} / participant selon la taille du groupe`;
}

export function PlanPicker({
  companyId,
  plans,
  currentPlanId,
  initialPlanId,
}: {
  companyId: string;
  plans: PlanWithBrackets[];
  currentPlanId?: string | null;
  /**
   * Sprint du 5 août 2026 — met en avant l'offre visée par un lien profond
   * (`?offre=<slug>` ou `User.intendedPlanId`) sans la sélectionner
   * automatiquement : l'utilisateur confirme toujours son choix lui-même.
   */
  initialPlanId?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);

  async function handleSelect(planId: string) {
    setError(null);
    setSubmittingId(planId);
    try {
      const result = await selectPlan(companyId, planId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/entreprise/paiement");
      router.refresh();
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col gap-2 rounded-lg border bg-white p-5 ${
              initialPlanId === plan.id ? "border-2 border-gold" : "border-border"
            }`}
          >
            <p className="text-base font-bold text-navy">{plan.name}</p>
            {plan.description && <p className="text-sm text-text-mid">{plan.description}</p>}
            <p className="mt-1 text-lg font-bold text-navy">
              {plan.pricingMode === "FIXED_BUNDLE"
                ? `${formatPlanPrice(plan)} — forfait ${plan.includedSeats ?? "?"} sièges`
                : plan.pricingMode === "TIERED_GROUP"
                  ? tieredPriceLabel(plan)
                  : `${formatPlanPrice(plan)} / participant / an`}
            </p>
            <ul className="flex flex-col gap-1 text-xs text-text-muted">
              {plan.pricingMode === "TIERED_GROUP" && plan.priceBrackets.length > 0 && (
                <li>
                  Réservé aux entreprises inscrivant ≥{" "}
                  {Math.min(...plan.priceBrackets.map((b) => b.minParticipants))} participants
                </li>
              )}
              {plan.pricingMode !== "FIXED_BUNDLE" &&
                plan.pricingMode !== "TIERED_GROUP" &&
                plan.minParticipants && (
                  <li>Réservé aux entreprises inscrivant ≥ {plan.minParticipants} participants</li>
                )}
              {plan.maxTeamMembers && <li>Jusqu&apos;à {plan.maxTeamMembers} collaborateurs</li>}
              {plan.eligibilityNote && <li>{plan.eligibilityNote}</li>}
            </ul>
            <Button
              onClick={() => handleSelect(plan.id)}
              disabled={submittingId !== null}
              className="mt-2 justify-center"
              variant={currentPlanId === plan.id ? "secondary" : "default"}
            >
              {submittingId === plan.id
                ? "…"
                : currentPlanId === plan.id
                  ? "Offre sélectionnée"
                  : "Choisir cette offre"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
