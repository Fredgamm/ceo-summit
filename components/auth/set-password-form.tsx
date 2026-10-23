"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SetPasswordFormProps {
  mode: "activation" | "reset";
  submitLabel: string;
  onSubmit: (
    password: string,
    confirmPassword: string
  ) => Promise<{ success: true; data: unknown } | { success: false; error: string }>;
  /** Only used in activation mode — enables auto-login right after success. */
  email?: string;
}

/**
 * Shared "choose a password" form for both the activation flow (E1-T03) and
 * the reset-password flow (E1-T06) — same UI, same validation, different
 * server action wired in by the parent page.
 */
export function SetPasswordForm({ mode, submitLabel, onSubmit, email }: SetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  // 23 oct. 2026 — reste occupé après succès, jusqu'au départ de la page.
  const [redirecting, setRedirecting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await onSubmit(password, confirmPassword);
      if (!result.success) {
        setError(result.error);
        return;
      }

      if (mode === "activation" && email) {
        // Auto sign-in right after activation so the member lands straight
        // in their space instead of having to log in a second time, then
        // straight into the onboarding tutorial (E1-T05).
        await signIn("credentials", { email, password, redirect: false });
        setRedirecting(true);
        router.push("/bienvenue");
        router.refresh();
      } else {
        setRedirecting(true);
        router.push("/login?reset=success");
      }
    } catch (err) {
      console.error("[set-password] failed", err);
      setError("L'opération n'a pas abouti. Vérifiez votre réseau puis réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <PasswordInput
          id="password"
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
        <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
        <PasswordInput
          id="confirmPassword"
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

      <Button
        type="submit"
        size="lg"
        className="mt-1 w-full justify-center"
        disabled={loading || redirecting}
        aria-busy={loading || redirecting}
      >
        {(loading || redirecting) && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {redirecting ? "Redirection…" : loading ? "Traitement…" : submitLabel}
      </Button>
    </form>
  );
}
