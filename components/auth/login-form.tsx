"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { Lock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().min(1, "L'email est requis").email("Adresse email invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

/**
 * B2/B3 (audit du 29 juillet 2026) — chaque code d'erreur lancé par
 * auth.ts a désormais un message dédié, au lieu du "Email ou mot de passe
 * incorrect" générique qui masquait auparavant les comptes en attente
 * d'activation ou expirés (et laissait un compte EXPIRED s'authentifier
 * puis boucler entre /login et /dashboard).
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_SUSPENDED: "Votre compte est suspendu. Contactez l'équipe CEO Summit.",
  ACCOUNT_EXPIRED: "Votre adhésion a expiré. Contactez l'équipe CEO Summit pour la renouveler.",
  ACCOUNT_PENDING_ACTIVATION: "Ce compte n'a pas encore été activé. Contactez l'équipe CEO Summit.",
  RATE_LIMITED: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
  NETWORK: "La connexion n'a pas abouti. Vérifiez votre réseau puis réessayez.",
};

/**
 * Correctif (7 août 2026, audit) — `callbackUrl` était passé tel quel à
 * `router.push()` après un `signIn({ redirect: false })`, qui contourne
 * exprès le callback `redirect` interne de NextAuth (jamais invoqué ici) :
 * une URL du type `?callbackUrl=https://faux-site.example` renvoyait la
 * victime, fraîchement authentifiée pour de vrai, droit vers une page de
 * phishing. `middleware.ts` ne pose lui-même ce paramètre que vers un
 * `pathname` interne, mais rien n'empêchait un lien forgé de porter
 * n'importe quelle valeur — seul un chemin relatif à cette origine
 * (commençant par un unique `/`, jamais `//` qui est protocol-relative) est
 * désormais accepté.
 *
 * 25 septembre 2026 (audit MVP) — `/\evil.example` passait ce contrôle,
 * or les navigateurs normalisent `\` en `/` (→ `//evil.example`,
 * protocol-relative), tout comme ils suppriment tabulations et retours à la
 * ligne (`/\t/evil.example`). Refus désormais de tout antislash et de tout
 * caractère de contrôle, puis contre-vérification que l'URL résolue reste
 * bien sur l'origine courante.
 */
const SAFE_CALLBACK_FALLBACK = "/dashboard";

export function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return SAFE_CALLBACK_FALLBACK;
  // eslint-disable-next-line no-control-regex -- caractères de contrôle volontairement refusés
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return SAFE_CALLBACK_FALLBACK;
  try {
    const base = "http://callback.invalid";
    if (new URL(raw, base).origin !== base) return SAFE_CALLBACK_FALLBACK;
  } catch {
    return SAFE_CALLBACK_FALLBACK;
  }
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  // 23 oct. 2026 — « signing-in » pendant la vérification, « redirecting »
  // une fois connecté, jusqu'à l'arrivée sur la page suivante : le bouton
  // redevenait « Se connecter » page encore en chargement, et l'on recliquait
  // en croyant que rien ne s'était passé.
  const [phase, setPhase] = React.useState<"idle" | "signing-in" | "redirecting">("idle");
  const loading = phase !== "idle";

  // Filet de sécurité : si la page suivante n'arrive pas, le bouton redevient
  // utilisable plutôt que de rester bloqué.
  React.useEffect(() => {
    if (phase !== "redirecting") return;
    const timer = setTimeout(() => setPhase("idle"), 15_000);
    return () => clearTimeout(timer);
  }, [phase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setPhase("signing-in");
    try {
      const result = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });

      if (result?.error) {
        setFormError(result.error);
        setPhase("idle");
        return;
      }

      // Le bouton reste occupé jusqu'au départ de la page.
      setPhase("redirecting");
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      console.error("[login] sign-in failed", err);
      setFormError("NETWORK");
      setPhase("idle");
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8">
        <h2 className="mb-1.5 text-2xl font-bold text-navy">Connexion à votre espace</h2>
        <p className="text-sm text-text-muted">Membres CEO Summit — accès réservé</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Adresse email</Label>
          <Input
            id="email"
            type="email"
            placeholder="vous@entreprise.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email && (
            <p id="email-error" role="alert" className="text-xs text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <Link href="/mot-de-passe-oublie" className="text-xs font-normal text-navy-mid">
              Mot de passe oublié ?
            </Link>
          </div>
          <PasswordInput
            id="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
          />
          {fieldErrors.password && (
            <p id="password-error" role="alert" className="text-xs text-red-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>
              {AUTH_ERROR_MESSAGES[formError] ?? "Email ou mot de passe incorrect."}
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          size="lg"
          className="mt-1 w-full justify-center"
          disabled={loading}
          aria-busy={loading}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {phase === "redirecting"
            ? "Ouverture de votre espace…"
            : phase === "signing-in"
              ? "Connexion…"
              : "Se connecter"}
        </Button>
      </form>

      <Alert variant="gold" className="mt-5">
        <Lock />
        <AlertDescription>
          L&apos;accès à la plateforme est réservé aux membres actifs. L&apos;inscription est
          soumise à vérification.
        </AlertDescription>
      </Alert>
    </div>
  );
}
