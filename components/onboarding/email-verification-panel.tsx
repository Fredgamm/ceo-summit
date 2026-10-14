"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { changeUnverifiedEmail, resendEmailVerification } from "@/app/actions/email-verification";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 14 oct. 2026 — écran « Confirmez votre adresse e-mail », affiché à la place
 * du paiement tant que le lien reçu n'a pas été ouvert
 * (app/entreprise/paiement/page.tsx).
 */
export function EmailVerificationPanel({ email }: { email: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState(email);
  const [pending, setPending] = React.useState<"resend" | "change" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleResend() {
    setError(null);
    setPending("resend");
    try {
      const result = await resendEmailVerification();
      if (!result.success) return setError(result.error);
      toast.success(`Nouveau lien envoyé à ${email}.`);
    } finally {
      setPending(null);
    }
  }

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("change");
    try {
      const result = await changeUnverifiedEmail(newEmail);
      if (!result.success) return setError(result.error);
      toast.success(`Adresse corrigée : lien envoyé à ${newEmail.trim().toLowerCase()}.`);
      setEditing(false);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-pale text-navy">
          <Mail className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 text-sm">
          <p className="text-text-mid">Lien envoyé à</p>
          <p className="truncate font-semibold text-navy">{email}</p>
          <p className="mt-1 text-xs text-text-muted">
            Pensez à regarder dans les courriers indésirables. Le lien est valable 72 heures.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => router.refresh()} className="justify-center">
          J&apos;ai confirmé mon adresse
        </Button>
        <Button
          variant="outline"
          onClick={handleResend}
          disabled={pending !== null}
          className="justify-center"
        >
          {pending === "resend" ? "Envoi…" : "Renvoyer le lien"}
        </Button>
      </div>

      {editing ? (
        <form onSubmit={handleChange} className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-email">Adresse e-mail correcte</Label>
            <Input
              id="new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={pending !== null}>
              {pending === "change" ? "Envoi…" : "Corriger et renvoyer le lien"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="self-start text-sm font-medium text-navy-mid underline-offset-4 hover:underline"
        >
          Ce n&apos;est pas la bonne adresse ?
        </button>
      )}
    </div>
  );
}
