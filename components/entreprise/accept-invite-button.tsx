"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { acceptCompanyInvite } from "@/app/actions/company-invites";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Parcours revu (1er août 2026) — mot de passe choisi ici, connexion automatique juste après. */
export function AcceptInviteButton({
  token,
  initialTitle,
}: {
  token: string;
  initialTitle?: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(initialTitle ?? "");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await acceptCompanyInvite(token, password, confirmPassword, title);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const signInResult = await signIn("credentials", {
        email: result.data.email,
        password,
        redirect: false,
      });
      if (!signInResult || signInResult.error) {
        toast.error(
          "Votre compte est créé, mais la connexion automatique a échoué — connectez-vous pour continuer."
        );
        router.push(`/login?callbackUrl=${encodeURIComponent("/bienvenue")}`);
        return;
      }
      router.push("/bienvenue");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-title">Votre fonction</Label>
        <Input
          id="invite-title"
          placeholder="ex. Directeur financier"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoComplete="organization-title"
        />
        <p className="text-xs text-text-muted">
          Elle figurera sur votre badge pour l&apos;événement.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-password">Choisissez votre mot de passe</Label>
        <PasswordInput
          id="invite-password"
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
        <Label htmlFor="invite-confirm-password">Confirmer le mot de passe</Label>
        <PasswordInput
          id="invite-confirm-password"
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

      <Button type="submit" disabled={loading} className="w-full justify-center">
        {loading ? "Création…" : "Accepter l'invitation et créer mon compte"}
      </Button>
    </form>
  );
}
