"use client";

import * as React from "react";
import { MailCheck } from "lucide-react";

import { requestPasswordReset } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Délai avant de pouvoir redemander un lien (le serveur limite aussi à 5 par heure). */
const RESEND_COOLDOWN_S = 60;

const UNEXPECTED_ERROR =
  "L'envoi n'a pas abouti. Rechargez la page puis réessayez dans un instant.";

/**
 * E1-T06 — always shows the same confirmation regardless of whether the
 * email matched an account (anti-enumeration — see requestPasswordReset).
 *
 * 21 oct. 2026 — une erreur imprévue de l'action serveur (réseau, page
 * ouverte avant un déploiement…) laissait le formulaire tel quel, sans aucun
 * message : on l'affiche désormais. La confirmation devient un écran à part
 * entière (où regarder, combien de temps le lien vaut, renvoyer, changer
 * d'adresse) au lieu d'une ligne sous un texte qui demandait encore l'e-mail.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const confirmationRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  React.useEffect(() => {
    if (sentTo) confirmationRef.current?.focus();
  }, [sentTo]);

  async function send(address: string) {
    setError(null);
    setLoading(true);
    try {
      const result = await requestPasswordReset(address);
      if (!result.success) {
        setError(result.error);
        return false;
      }
      setSentTo(address.trim());
      setCooldown(RESEND_COOLDOWN_S);
      return true;
    } catch (err) {
      console.error("[forgot-password] request failed", err);
      setError(UNEXPECTED_ERROR);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await send(email);
  }

  function resetAddress() {
    setSentTo(null);
    setError(null);
    setEmail("");
  }

  if (sentTo) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-pale text-navy">
          <MailCheck className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2
          ref={confirmationRef}
          tabIndex={-1}
          className="text-lg font-bold text-navy focus:outline-none"
        >
          Vérifiez votre boîte mail
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-mid">
          Si un compte CEO Summit est associé à{" "}
          <strong className="break-all font-semibold text-navy">{sentTo}</strong>, vous allez
          recevoir un lien pour choisir un nouveau mot de passe. Ce lien est valable 1 heure.
        </p>
        <p className="mt-3 rounded-md bg-surface px-3 py-2 text-xs text-text-muted">
          Rien reçu d&apos;ici quelques minutes ? Regardez dans vos courriers indésirables.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-4 text-left">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-5 flex w-full flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            disabled={loading || cooldown > 0}
            onClick={() => send(sentTo)}
          >
            {loading
              ? "Envoi…"
              : cooldown > 0
                ? `Renvoyer le lien (${cooldown} s)`
                : "Renvoyer le lien"}
          </Button>
          <button
            type="button"
            onClick={resetAddress}
            className="py-1.5 text-sm font-semibold text-navy-mid hover:text-navy"
          >
            Utiliser une autre adresse
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <p className="-mt-2 text-center text-sm text-text-muted">
        Indiquez l&apos;adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un
        nouveau mot de passe.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email">Adresse e-mail</Label>
        <Input
          id="forgot-email"
          type="email"
          placeholder="vous@entreprise.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
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
        className="w-full justify-center"
        disabled={loading || !email.trim()}
      >
        {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
      </Button>
    </form>
  );
}
