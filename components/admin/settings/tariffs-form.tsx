"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveCreditPackPrices } from "@/app/actions/admin-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — `MembershipTariffsForm`
 * (tarifs des 3 tiers fixes) est retiré : les prix/crédits inclus d'une
 * offre se gèrent désormais depuis /admin/plans (voir lib/plans-query.ts,
 * app/actions/admin-plans.ts). Les packs crédits Deal Room, eux, restent
 * ici — ce sont déjà des lignes dynamiques (`CreditPackPrice`), pas liées
 * au `Tier`/`Plan` de qui les achète.
 */

interface CreditPackPricesFormProps {
  packs: { credits: number; priceAr: number }[];
}

/** E8-T11 — "Tarifs packs crédits Deal Room" (Executive uniquement, Chairman illimité). */
export function CreditPackPricesForm({ packs }: CreditPackPricesFormProps) {
  const [values, setValues] = React.useState<Record<number, string>>(
    Object.fromEntries(packs.map((p) => [p.credits, String(p.priceAr)]))
  );
  const [loading, setLoading] = React.useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      const result = await saveCreditPackPrices(
        packs.map((p) => ({ credits: p.credits, priceAr: values[p.credits] }))
      );
      if (result.success) {
        toast.success("Tarifs des packs crédits mis à jour.");
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <h3 className="text-sm font-bold text-navy">Tarifs packs crédits Deal Room</h3>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Disponibles pour les membres Executive uniquement. Chairman : illimité.
      </p>
      <div className="flex flex-col gap-4">
        {packs.map((pack) => (
          <div key={pack.credits}>
            <Label className="mb-1.5 block text-sm font-bold text-navy">
              Pack {pack.credits} crédit{pack.credits > 1 ? "s" : ""}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={values[pack.credits]}
                onChange={(e) => setValues((v) => ({ ...v, [pack.credits]: e.target.value }))}
              />
              <span className="text-xs text-text-muted">Ar</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Enregistrement…" : "✓ Enregistrer les tarifs"}
        </Button>
      </div>
    </div>
  );
}
