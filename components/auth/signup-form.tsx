"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { Plan } from "@prisma/client";

import { signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary } from "@/lib/utils";

/**
 * Parcours revu (1er août 2026) — mot de passe choisi immédiatement, puis
 * connexion automatique et redirection vers l'onboarding, sans email
 * bloquant entre les deux (voir app/actions/auth.ts::signup).
 *
 * `intendedPlan` (Phase 2ter, 1er août 2026) — résolu et validé côté
 * serveur (page.tsx) depuis `?offre=<slug>`, transmis ici seulement pour
 * l'affichage et le renvoi de son id à signup().
 */
export function SignupForm({ intendedPlan }: { intendedPlan?: Plan | null }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signup(name, email, password, confirmPassword, intendedPlan?.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      await signIn("credentials", { email, password, redirect: false });
      router.push("/bienvenue");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {intendedPlan && (
        <Alert variant="gold">
          <AlertDescription>
            Vous vous inscrivez pour : <strong>{intendedPlan.name}</strong> —{" "}
            {formatAriary(intendedPlan.priceAr)}
            {intendedPlan.scope === "COMPANY" ? " / participant / an" : " / an"}
          </AlertDescription>
        </Alert>
      )}

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">Mot de passe</Label>
        <Input
          id="signup-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <p className="text-xs text-text-muted">
          Au moins 8 caractères, une majuscule et un chiffre.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm-password">Confirmer le mot de passe</Label>
        <Input
          id="signup-confirm-password"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
        {loading ? "Création du compte…" : "S'inscrire"}
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
