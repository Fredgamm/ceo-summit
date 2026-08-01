"use client";

import * as React from "react";
import Link from "next/link";

import { signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Phase 2 offres/paiement — inscription self-service, nom + email seulement. */
export function SignupForm() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signup(name, email);
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
          Un email de confirmation vient d&apos;être envoyé à {email}. Cliquez sur le lien
          qu&apos;il contient pour choisir votre mot de passe et accéder à votre espace.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name">Nom complet</Label>
        <Input
          id="signup-name"
          placeholder="Jean-Pierre Rakoto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">Adresse email</Label>
        <Input
          id="signup-email"
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
        {loading ? "Inscription…" : "S'inscrire"}
      </Button>

      <p className="text-center text-xs text-text-muted">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-navy-mid">
          Connectez-vous
        </Link>
      </p>
    </form>
  );
}
