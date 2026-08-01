"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { selectIndividualPlan } from "@/app/actions/membership-subscription";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Phase 2ter (1er août 2026) — confirmation de l'offre individuelle
 * choisie sur le site public (`User.intendedPlanId`) : un seul clic crée
 * le Membership PENDING_PAYMENT et redirige vers la soumission de preuve,
 * sans redemander le choix d'offre déjà fait ailleurs.
 */
export function StartIndividualPlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const result = await selectIndividualPlan(planId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/adhesion/paiement");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={handleClick} disabled={loading} className="w-full justify-center">
        {loading ? "…" : "Continuer vers le paiement"}
      </Button>
    </div>
  );
}
