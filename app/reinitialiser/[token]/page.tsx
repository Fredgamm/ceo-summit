import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { checkResetToken } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordFormWrapper } from "@/components/auth/reset-password-form-wrapper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Réinitialiser mon mot de passe" };

/**
 * E1-T06 — reached from the ResetPasswordEmail link. Token TTL is 1h
 * (PASSWORD_RESET_TOKEN_TTL_MS), shorter than activation's 72h since it
 * gates an already-active account.
 */
export default async function ResetPasswordPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const result = await checkResetToken(params.token);

  if (!result.valid) {
    if (result.reason === "ALREADY_USED") {
      redirect("/login");
    }

    return (
      <AuthCard title="Lien de réinitialisation invalide">
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertDescription>
            {result.reason === "EXPIRED"
              ? "Ce lien a expiré (validité 1 heure). Demandez-en un nouveau."
              : "Ce lien de réinitialisation est introuvable ou invalide."}
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full justify-center">
          <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choisissez un nouveau mot de passe"
      subtitle="Votre nouveau mot de passe remplacera l'ancien immédiatement."
    >
      <ResetPasswordFormWrapper token={params.token} />
    </AuthCard>
  );
}
