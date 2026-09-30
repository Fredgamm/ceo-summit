import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Écrans d'onboarding (bienvenue, création entreprise, paiement) : avant ce
 * composant, aucun n'affichait de moyen de se déconnecter ni de revenir en
 * arrière, un utilisateur bloqué sur un de ces écrans n'avait aucune issue.
 */
export function OnboardingHeader({ backHref }: { backHref?: string }) {
  return (
    <header className="flex w-full max-w-4xl items-center justify-between px-6 pt-6">
      <div className="flex items-center gap-5">
        <Image src="/logo/ceo-summit-logo.png" alt="CEO Summit" width={90} height={43} />
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm font-medium text-text-mid hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Retour
          </Link>
        )}
      </div>
      <SignOutButton className="flex items-center gap-1.5 text-sm font-semibold text-navy-mid hover:text-navy" />
    </header>
  );
}
