"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { Plan } from "@prisma/client";

import { selectPlan } from "@/app/actions/company-subscription";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatPlanPriceLive } from "@/lib/utils";

export function PlanPicker({
  companyId,
  plans,
  currentPlanId,
  initialPlanId,
  liveEurToArRate,
}: {
  companyId: string;
  plans: Plan[];
  currentPlanId?: string | null;
  /**
   * Sprint du 5 août 2026 — met en avant l'offre visée par un lien profond
   * (`?offre=<slug>` ou `User.intendedPlanId`) sans la sélectionner
   * automatiquement : l'utilisateur confirme toujours son choix lui-même.
   */
  initialPlanId?: string | null;
  /**
   * Rapport QA du 30 sept. 2026 (§10) — cours du jour EUR→Ar
   * (`getEurToArRate()`, fourni par la page serveur) pour l'estimation
   * "≈ X Ar" affichée à côté d'un prix en €. N'affecte jamais le montant
   * réellement facturé (`plan.priceAr`, figé).
   */
  liveEurToArRate: number;
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
              {plan.pricingMode === "PER_PARTICIPANT"
                ? `${formatPlanPriceLive(plan, liveEurToArRate)} / participant`
                : formatPlanPriceLive(plan, liveEurToArRate)}
            </p>
            <ul className="flex flex-col gap-1 text-xs text-text-muted">
              {plan.pricingMode === "PER_PARTICIPANT" ? (
                plan.minParticipants && <li>À partir de {plan.minParticipants} participants</li>
              ) : (
                <li>{plan.maxTeamMembers ?? "?"} participants inclus</li>
              )}
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
