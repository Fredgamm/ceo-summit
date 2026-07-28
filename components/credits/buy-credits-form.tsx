"use client";

import * as React from "react";
import type { EventPaymentMethod } from "@prisma/client";

import { requestCreditPurchase } from "@/app/actions/credits";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn, formatAriary } from "@/lib/utils";

interface Pack {
  credits: number;
  priceAr: number;
}

/** E6-T05 — sélection d'un pack + mode de paiement, puis demande soumise à validation admin. */
export function BuyCreditsForm({ packs }: { packs: Pack[] }) {
  const [selected, setSelected] = React.useState(packs[Math.floor(packs.length / 2)] ?? packs[0]);
  const [method, setMethod] = React.useState<EventPaymentMethod>("MOBILE_MONEY");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const result = await requestCreditPurchase(selected.credits, method);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Alert variant="success">
        <AlertDescription>
          Demande envoyée — votre achat de {selected.credits} crédits sera crédité dès validation du
          paiement par l&apos;équipe CEO Summit.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {packs.map((pack) => (
          <button
            key={pack.credits}
            type="button"
            onClick={() => setSelected(pack)}
            className={cn(
              "rounded-xl border-2 p-5 text-left transition-colors",
              selected.credits === pack.credits ? "border-navy bg-surface" : "border-border"
            )}
          >
            <p className="text-3xl font-black text-navy">{pack.credits}</p>
            <p className="mt-1 text-lg font-extrabold text-navy">{formatAriary(pack.priceAr)}</p>
            <p className="text-xs text-text-muted">
              {formatAriary(Math.round(pack.priceAr / pack.credits))} / crédit
            </p>
          </button>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-navy">Mode de paiement</p>
        <div className="flex gap-3">
          {[
            { value: "MOBILE_MONEY" as const, label: "MVola / Orange Money" },
            { value: "VIREMENT" as const, label: "Virement bancaire" },
          ].map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex-1 cursor-pointer rounded-md border-2 p-3 text-sm",
                method === opt.value ? "border-navy bg-surface" : "border-border"
              )}
            >
              <input
                type="radio"
                className="mr-2"
                checked={method === opt.value}
                onChange={() => setMethod(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button size="lg" className="w-full justify-center" onClick={handleSubmit} disabled={loading}>
        {loading ? "Envoi…" : `Acheter — ${formatAriary(selected.priceAr)} →`}
      </Button>
    </div>
  );
}
