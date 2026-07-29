"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  approveOpportunity,
  rejectOpportunity,
  requestOpportunityChanges,
} from "@/app/actions/admin-deal-room";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Mode = null | "changes" | "reject";

/** E8-T06 — panneau "Décision de modération" : valider / demander modifications / refuser. */
export function OpportunityDecisionPanel({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const result = await approveOpportunity(opportunityId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/deal-room");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitText() {
    setLoading(true);
    setError(null);
    try {
      const result =
        mode === "changes"
          ? await requestOpportunityChanges(opportunityId, text)
          : await rejectOpportunity(opportunityId, text);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/deal-room");
    } finally {
      setLoading(false);
    }
  }

  if (mode) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-navy p-4">
        <p className="text-sm font-bold text-white">
          {mode === "changes"
            ? "Message à envoyer à l'auteur"
            : "Motif du refus (envoyé au membre)"}
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={
            mode === "changes" ? "Décrivez les modifications attendues…" : "Motif du refus…"
          }
          className="bg-white"
        />
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-white/70"
            onClick={() => {
              setMode(null);
              setText("");
              setError(null);
            }}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={handleSubmitText}
            disabled={loading || !text.trim()}
          >
            {loading ? "Envoi…" : mode === "changes" ? "Envoyer la demande" : "Refuser"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-navy p-4">
      <p className="mb-1.5 text-sm font-bold text-white">Décision de modération</p>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <Button className="justify-center" onClick={handleApprove} disabled={loading}>
        {loading ? "…" : "✓ Valider et publier"}
      </Button>
      <Button
        variant="ghost"
        className="justify-center text-white/70"
        onClick={() => setMode("changes")}
        disabled={loading}
      >
        ✎ Demander modifications
      </Button>
      <Button
        variant="ghost"
        className="justify-center text-red-300"
        onClick={() => setMode("reject")}
        disabled={loading}
      >
        ✕ Refuser la publication
      </Button>
    </div>
  );
}
