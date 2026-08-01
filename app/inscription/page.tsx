import type { Metadata } from "next";

import { getPlanBySlug } from "@/lib/plans-query";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Inscription" };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — porte d'entrée self-service.
 * Volontairement légère (nom + email) pour ne pas décourager l'inscription
 * initiale — la création d'entreprise, l'invitation de collaborateurs et le
 * choix d'une offre viennent après, une fois le compte confirmé.
 *
 * `?offre=<slug>` (Phase 2ter, 1er août 2026) — lien profond depuis le site
 * public vitrine. Résolu ici, côté serveur (pas dans le composant client),
 * pour ne jamais faire confiance à autre chose que le slug dans l'URL — un
 * slug inconnu/désactivé/sponsoring retombe simplement sur `null`.
 */
export default async function SignupPage({ searchParams }: { searchParams: { offre?: string } }) {
  const intendedPlan = searchParams.offre ? await getPlanBySlug(searchParams.offre) : null;

  return (
    <AuthCard
      title="Créer mon compte"
      subtitle="Rejoignez CEO Summit — l'inscription est gratuite, le paiement vient plus tard."
    >
      <SignupForm intendedPlan={intendedPlan} />
    </AuthCard>
  );
}
