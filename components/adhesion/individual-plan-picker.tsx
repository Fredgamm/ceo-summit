"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@prisma/client";

import { selectIndividualPlan } from "@/app/actions/membership-subscription";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary } from "@/lib/utils";

/**
 * Phase 2ter (1er août 2026) — choix d'une offre individuelle depuis
 * /paiement-en-attente (organique, sans lien profond au préalable).
 * Contrairement au wizard entreprise, une seule étape suffit : pas
 * d'entreprise à renseigner ensuite, direct vers la soumission de
 * paiement.
 */
export function IndividualPlanPicker({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSelect(planId: string) {
    setError(null);
    setSubmittingId(planId);
    try {
      const result = await selectIndividualPlan(planId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/adhesion/paiement");
    } finally {
      setSubmittingId(null);
    }
  }

  if (plans.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Aucune offre individuelle disponible pour l&apos;instant.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            disabled={submittingId !== null}
            onClick={() => handleSelect(plan.id)}
            className="flex flex-col gap-1 rounded-lg border-2 border-border bg-white p-4 text-left transition-colors hover:border-navy disabled:cursor-not-allowed disabled:opacity-60"
          >
            <p className="text-sm font-bold text-navy">{plan.name}</p>
            <p className="text-base font-bold text-navy">{formatAriary(plan.priceAr)} / an</p>
            <p className="text-xs text-text-muted">
              {plan.hasUnlimitedCredits
                ? "Crédits Deal Room illimités"
                : `${plan.includedCredits} crédits Deal Room inclus`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
