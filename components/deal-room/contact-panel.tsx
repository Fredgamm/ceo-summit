"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { contactOpportunityAuthor } from "@/app/actions/deal-room";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ContactPanelProps {
  opportunityId: string;
  authorName: string;
}

/**
 * E6-T02 — "Prendre contact" avec modal de confirmation.
 *
 * Décision d'architecture (sept. 2026, conception/09) — le coût en crédits
 * et le bypass Chairman ont disparu avec le système de crédits Deal Room
 * (retiré du chemin actif) : prendre contact est gratuit et illimité pour
 * tout membre.
 */
export function ContactPanel({ opportunityId, authorName }: ContactPanelProps) {
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
        ✉ Contacter
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <p className="mb-3 text-sm text-text-mid">
        Contacter {authorName} ? Vous débloquez ses coordonnées et l&apos;envoi d&apos;un message
        d&apos;introduction.
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
          {loading ? "Traitement…" : "Confirmer le contact"}
        </Button>
      </div>
    </div>
  );
}
