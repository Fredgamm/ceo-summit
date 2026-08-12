"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { contactOpportunityAuthor } from "@/app/actions/deal-room";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ContactPanelProps {
  opportunityId: string;
  authorName: string;
  isChairman: boolean;
  /** Configurable par l'admin (7 août 2026) — voir lib/deal-room-settings.ts. */
  contactCost: number;
}

/**
 * E6-T02 — "Prendre contact" avec modal de confirmation avant déduction.
 * Si le solde est à 0, l'action renvoie code=INSUFFICIENT_CREDITS et cette
 * page redirige vers /credits/acheter (backlog : "Si solde 0 → redirect").
 */
export function ContactPanel({
  opportunityId,
  authorName,
  isChairman,
  contactCost,
}: ContactPanelProps) {
  const isFree = isChairman || contactCost === 0;
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const result = await contactOpportunityAuthor(opportunityId);
      if (!result.success) {
        if (result.code === "INSUFFICIENT_CREDITS") {
          router.push("/credits/acheter");
          return;
        }
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Alert variant="success">
        <AlertDescription>
          Contact envoyé — {authorName} a reçu vos coordonnées et peut vous répondre directement.
        </AlertDescription>
      </Alert>
    );
  }

  if (!confirming) {
    return (
      <Button size="lg" className="w-full justify-center" onClick={() => setConfirming(true)}>
        ✉ Contacter{isFree ? "" : ` (${contactCost} crédit${contactCost > 1 ? "s" : ""})`}
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <p className="mb-3 text-sm text-text-mid">
        {isChairman
          ? `Contacter ${authorName} ? En tant que Chairman, aucun crédit ne sera déduit.`
          : contactCost === 0
            ? `Contacter ${authorName} ? La prise de contact est gratuite pour l'instant.`
            : `En utilisant ${contactCost} crédit${contactCost > 1 ? "s" : ""}, vous débloquez les coordonnées de ${authorName} et l'envoi d'un message d'introduction.`}
      </p>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={loading}>
          Annuler
        </Button>
        <Button onClick={handleConfirm} disabled={loading} className="flex-1 justify-center">
          {loading
            ? "Traitement…"
            : isFree
              ? "Confirmer le contact"
              : `Utiliser ${contactCost} crédit${contactCost > 1 ? "s" : ""} et contacter`}
        </Button>
      </div>
    </div>
  );
}
