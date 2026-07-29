"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Tier } from "@prisma/client";

import { approveApplication, refuseApplication, requestMoreInfo } from "@/app/actions/candidatures";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary, tierLabel } from "@/lib/utils";

interface CandidatureDecisionPanelProps {
  applicationId: string;
  requestedTier: Tier;
  prices: Record<Tier, number>;
  includedCredits: Record<"MEMBER" | "EXECUTIVE", number>;
}

/**
 * E8-T03 — decision panel on a pending candidature. RG-07: the "refuser"
 * textarea is an internal note, never sent to the candidate (see
 * app/actions/candidatures.ts refuseApplication + ApplicationRefusedEmail).
 * E8-T11 — prices/includedCredits come from PlatformSetting (see
 * lib/platform-settings.ts) instead of being hardcoded here.
 */
export function CandidatureDecisionPanel({
  applicationId,
  requestedTier,
  prices,
  includedCredits,
}: CandidatureDecisionPanelProps) {
  const router = useRouter();
  const [tier, setTier] = React.useState<Tier>(requestedTier);

  const TIERS: { value: Tier; price: number; perk: string }[] = [
    { value: "MEMBER", price: prices.MEMBER, perk: "Accès de base" },
    {
      value: "EXECUTIVE",
      price: prices.EXECUTIVE,
      perk: `${includedCredits.EXECUTIVE} crédits Deal Room`,
    },
    { value: "CHAIRMAN", price: prices.CHAIRMAN, perk: "Crédits illimités" },
  ];
  const [mode, setMode] = React.useState<"idle" | "refuse" | "info">("idle");
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleApprove() {
    setError(null);
    setLoading(true);
    try {
      const result = await approveApplication(applicationId, tier);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/candidatures");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefuse() {
    setError(null);
    setLoading(true);
    try {
      const result = await refuseApplication(applicationId, text);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/candidatures");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestInfo() {
    setError(null);
    setLoading(true);
    try {
      const result = await requestMoreInfo(applicationId, text);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMode("idle");
      setText("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg bg-navy p-5">
      <p className="mb-4 text-sm font-bold text-white">Décision d&apos;admission</p>

      <div className="mb-4 flex flex-col gap-2">
        {TIERS.map((t) => (
          <label
            key={t.value}
            className={`flex cursor-pointer items-center gap-3 rounded-md p-2.5 ${
              tier === t.value ? "bg-gold/15 ring-1 ring-gold" : "bg-white/[0.07]"
            }`}
          >
            <input type="radio" checked={tier === t.value} onChange={() => setTier(t.value)} />
            <div>
              <p className="text-sm font-semibold text-white">
                {tierLabel(t.value)}
                {t.value === requestedTier && " · Demandé"}
              </p>
              <p className="text-xs text-white/50">
                {formatAriary(t.price)}/an · {t.perk}
              </p>
            </div>
          </label>
        ))}
      </div>

      {mode === "idle" && (
        <div className="flex flex-col gap-2">
          <Button onClick={handleApprove} disabled={loading} className="w-full justify-center">
            ✓ Valider l&apos;admission
          </Button>
          <Button
            variant="ghost"
            onClick={() => setMode("info")}
            disabled={loading}
            className="w-full justify-center text-white/70 hover:text-white"
          >
            ✉ Demander infos complémentaires
          </Button>
          <Button
            variant="destructive"
            onClick={() => setMode("refuse")}
            disabled={loading}
            className="w-full justify-center"
          >
            ✕ Refuser la candidature
          </Button>
        </div>
      )}

      {mode !== "idle" && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "refuse"
                ? "Motif interne (non communiqué au candidat)…"
                : "Précisez les informations manquantes…"
            }
            className="bg-white"
          />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setMode("idle");
                setText("");
              }}
              disabled={loading}
              className="text-white/70 hover:text-white"
            >
              Annuler
            </Button>
            <Button
              onClick={mode === "refuse" ? handleRefuse : handleRequestInfo}
              disabled={loading}
              className="flex-1 justify-center"
            >
              {loading ? "Envoi…" : mode === "refuse" ? "Confirmer le refus" : "Envoyer le message"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
