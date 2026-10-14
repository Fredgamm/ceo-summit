import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";

import { auth } from "@/auth";
import { sendCompanyAdminWelcome, verifyEmailToken } from "@/lib/email-verification";
import { JourneyShell } from "@/components/onboarding/journey-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Confirmation de l'adresse e-mail" };

/**
 * 14 oct. 2026 — lien reçu par e-mail après l'inscription
 * (lib/email-verification.ts). Page publique (middleware.ts) : le lien peut
 * être ouvert sur un autre appareil que celui de l'inscription.
 */
export default async function VerifyEmailPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const result = await verifyEmailToken(token);
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.id);

  if (result.status !== "verified") {
    return (
      <JourneyShell
        current="compte"
        title={result.status === "expired" ? "Ce lien a expiré" : "Lien invalide"}
        subtitle={
          result.status === "expired"
            ? "Le lien de confirmation est valable 72 heures. Demandez-en un nouveau depuis votre espace."
            : "Ce lien de confirmation est introuvable ou a été remplacé par un plus récent. Utilisez le dernier e-mail reçu, ou demandez un nouveau lien."
        }
      >
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Votre adresse n&apos;est pas encore confirmée.</p>
        </div>
        <Button asChild className="mt-6 w-full justify-center sm:w-auto">
          <Link
            href={
              isLoggedIn ? "/entreprise/paiement" : "/login?callbackUrl=%2Fentreprise%2Fpaiement"
            }
          >
            {isLoggedIn ? "Recevoir un nouveau lien" : "Me connecter pour recevoir un nouveau lien"}
          </Link>
        </Button>
      </JourneyShell>
    );
  }

  if (!result.alreadyVerified) await sendCompanyAdminWelcome(result.userId);

  return (
    <JourneyShell
      current="paiement"
      title="Adresse e-mail confirmée"
      subtitle="Merci ! Vous pouvez maintenant procéder au paiement de votre offre."
    >
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>Votre adresse est confirmée. Un récapitulatif vous a été envoyé par e-mail.</p>
      </div>
      <Button asChild size="lg" className="mt-6 w-full justify-center sm:w-auto">
        <Link
          href={isLoggedIn ? "/entreprise/paiement" : "/login?callbackUrl=%2Fentreprise%2Fpaiement"}
        >
          {isLoggedIn ? "Continuer vers le paiement" : "Me connecter pour payer"}
        </Link>
      </Button>
    </JourneyShell>
  );
}
