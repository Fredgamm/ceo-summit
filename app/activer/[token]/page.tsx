import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { checkActivationToken } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { ActivationFormWrapper } from "@/components/auth/activation-form-wrapper";
import { ResendActivationForm } from "@/components/auth/resend-activation-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Activer mon compte" };

/**
 * E1-T03 — UC-P1-02. Reached from the ActivationEmail link sent by the
 * Evolia webhook (E1-T02). Token is validated server-side before rendering
 * any form — expired/used links get a dedicated recovery message instead of
 * a broken form (matches phase1_evolia_membres.md flux alternatifs).
 */
export default async function ActivationPage({ params }: { params: { token: string } }) {
  const result = await checkActivationToken(params.token);

  if (!result.valid) {
    // Acceptance criteria (E1-T03): "token déjà utilisé → redirect /login" —
    // an already-activated account has nothing to recover here.
    if (result.reason === "ALREADY_USED") {
      redirect("/login");
    }

    return (
      <AuthCard title="Lien d'activation invalide">
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertDescription>{reasonMessage(result.reason)}</AlertDescription>
        </Alert>

        {result.reason === "EXPIRED" ? (
          <ResendActivationForm />
        ) : (
          <Button asChild className="w-full justify-center">
            <Link href="/login">Retour à la connexion</Link>
          </Button>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Bienvenue, ${result.memberName.split(" ")[0]}`}
      subtitle="Choisissez votre mot de passe pour activer votre accès CEO Summit."
    >
      <ActivationFormWrapper token={params.token} email={result.email} />
    </AuthCard>
  );
}

function reasonMessage(reason: "NOT_FOUND" | "EXPIRED") {
  switch (reason) {
    case "EXPIRED":
      return "Ce lien d'activation a expiré (validité 72h). Recevez-en un nouveau ci-dessous.";
    default:
      return "Ce lien d'activation est introuvable ou invalide.";
  }
}
