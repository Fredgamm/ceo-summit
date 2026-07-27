import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

/**
 * E1-T06 — reached from the "Mot de passe oublié ?" link on /login.
 * Ref: conception/01_onboarding_acces.md US-018.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="Indiquez votre email pour recevoir un lien de réinitialisation."
    >
      <ForgotPasswordForm />

      <p className="mt-6 text-center text-sm text-text-muted">
        <Link href="/login" className="font-semibold text-navy-mid">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  );
}
