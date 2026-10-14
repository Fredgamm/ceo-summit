"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { activateStaffOffer } from "@/app/actions/staff-offer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface StaffOfferOption {
  id: string;
  label: string;
}

/**
 * 14 oct. 2026 — l'administrateur choisit l'événement auquel inscrire son
 * staff (offre « Staff » gratuite), sans passer par le paiement.
 */
export function StaffOfferPicker({
  companyId,
  offers,
  currentPlanId,
  needsUnlimitedSeats = false,
}: {
  companyId: string;
  offers: StaffOfferOption[];
  currentPlanId: string | null;
  /** Offre déjà active mais encore plafonnée (activée avant le 14 oct. 2026). */
  needsUnlimitedSeats?: boolean;
}) {
  const router = useRouter();
  const [planId, setPlanId] = React.useState(
    offers.some((o) => o.id === currentPlanId) ? currentPlanId! : (offers[0]?.id ?? "")
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleActivate() {
    setError(null);
    setSaving(true);
    try {
      const result = await activateStaffOffer(companyId, planId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Événement activé : vous pouvez inscrire votre staff.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="staff-offer" className="sr-only">
          Événement
        </label>
        <select
          id="staff-offer"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="h-10 flex-1 rounded-md border border-input bg-white px-3 text-sm text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {offers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          onClick={handleActivate}
          disabled={saving || !planId || (planId === currentPlanId && !needsUnlimitedSeats)}
        >
          {saving ? "Activation…" : currentPlanId ? "Changer d'événement" : "Inscrire mon staff"}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
