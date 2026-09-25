"use client";

import * as React from "react";

import { resendActivationLink } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Écran E3 (phase1_evolia_membres.md) — shown when an activation link has
 * expired. The member re-enters their email; the server decides whether an
 * account exists and is still pending activation before sending a new link.
 */
export function ResendActivationForm() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await resendActivationLink(email);
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
          Si un compte en attente d&apos;activation existe pour {email}, un nouveau lien vient
          d&apos;être envoyé. Il est valable 72 heures.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resend-email">Adresse email</Label>
        <Input
          id="resend-email"
          type="email"
          placeholder="vous@entreprise.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
        {loading ? "Envoi…" : "Recevoir un nouveau lien"}
      </Button>
    </form>
  );
}
