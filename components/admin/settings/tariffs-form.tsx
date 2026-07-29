"use client";

import * as React from "react";
import { toast } from "sonner";
import type { Tier } from "@prisma/client";

import { saveMembershipTariffs, saveCreditPackPrices } from "@/app/actions/admin-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tierLabel } from "@/lib/utils";

const TIER_PERK: Record<Tier, string> = {
  MEMBER: "Accès de base",
  EXECUTIVE: "+ Deal Room, crédits inclus",
  CHAIRMAN: "+ Crédits illimités + VIP",
};

interface MembershipTariffsFormProps {
  prices: Record<Tier, number>;
  includedCredits: Record<"MEMBER" | "EXECUTIVE", number>;
}

/** E8-T11 — "Tarifs membership annuels" + "Règles crédits inclus par tier". */
export function MembershipTariffsForm({ prices, includedCredits }: MembershipTariffsFormProps) {
  const [values, setValues] = React.useState<Record<Tier, string>>({
    MEMBER: String(prices.MEMBER),
    EXECUTIVE: String(prices.EXECUTIVE),
    CHAIRMAN: String(prices.CHAIRMAN),
  });
  const [credits, setCredits] = React.useState({
    MEMBER: String(includedCredits.MEMBER),
    EXECUTIVE: String(includedCredits.EXECUTIVE),
  });
  const [loading, setLoading] = React.useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      const result = await saveMembershipTariffs(values, credits);
      if (result.success) {
        toast.success("Tarifs et règles mis à jour — appliqués au prochain renouvellement.");
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <h3 className="text-sm font-bold text-navy">Tarifs membership annuels</h3>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Montants en Ariary (Ar). Toute modification entre en vigueur au prochain renouvellement.
      </p>
      <div className="flex flex-col gap-4">
        {(["MEMBER", "EXECUTIVE", "CHAIRMAN"] as Tier[]).map((tier) => (
          <div key={tier}>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-sm font-bold text-navy">{tierLabel(tier)}</Label>
              <span className="text-xs text-text-muted">{TIER_PERK[tier]}</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={values[tier]}
                onChange={(e) => setValues((v) => ({ ...v, [tier]: e.target.value }))}
                min={0}
              />
              <span className="whitespace-nowrap text-xs text-text-muted">Ar / an</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-bold text-navy">Crédits inclus par tier (annuel)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-xs font-bold text-navy">
              {tierLabel("MEMBER")}
            </Label>
            <Input
              type="number"
              min={0}
              value={credits.MEMBER}
              onChange={(e) => setCredits((c) => ({ ...c, MEMBER: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-bold text-navy">
              {tierLabel("EXECUTIVE")}
            </Label>
            <Input
              type="number"
              min={0}
              value={credits.EXECUTIVE}
              onChange={(e) => setCredits((c) => ({ ...c, EXECUTIVE: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-bold text-navy">
              {tierLabel("CHAIRMAN")}
            </Label>
            <Input value="Illimité (∞)" disabled />
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Enregistrement…" : "✓ Enregistrer les tarifs"}
        </Button>
      </div>
    </div>
  );
}

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
