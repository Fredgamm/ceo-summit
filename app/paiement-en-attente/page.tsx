import type { Metadata } from "next";

import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Paiement en attente" };

/**
 * B1f (audit du 29 juillet 2026) — avant ce correctif, un candidat approuvé
 * qui n'allait jamais au bout du paiement Evolia obtenait un accès complet
 * et gratuit (activateAccount passe le compte à ACTIVE sans vérifier qu'un
 * Membership existe). middleware.ts redirige maintenant ici tout membre
 * ACTIVE sans tier (donc sans Membership actif) plutôt que de le laisser
 * naviguer normalement.
 */
export default function PaymentPendingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-card-md">
        <h1 className="mb-3 text-xl font-bold text-navy">Paiement en attente</h1>
        <p className="mb-6 text-sm leading-relaxed text-text-mid">
          Votre candidature a été approuvée et votre compte est activé, mais votre adhésion
          n&apos;est pas encore réglée. Un email avec les instructions de paiement vous a été envoyé
          — l&apos;accès complet à la plateforme s&apos;active automatiquement dès sa confirmation.
        </p>
        <p className="mb-6 text-xs text-text-muted">
          Vous n&apos;avez pas reçu cet email ou avez une question ? Contactez l&apos;équipe CEO
          Summit.
        </p>
        <SignOutButton className="mx-auto flex items-center justify-center gap-2 text-sm font-semibold text-navy-mid" />
      </div>
    </div>
  );
}
