import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Inscription" };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — porte d'entrée self-service.
 * Volontairement légère (nom + email) pour ne pas décourager l'inscription
 * initiale — la création d'entreprise, l'invitation de collaborateurs et le
 * choix d'une offre viennent après, une fois le compte confirmé.
 */
export default function SignupPage() {
  return (
    <AuthCard
      title="Créer mon compte"
      subtitle="Rejoignez CEO Summit — l'inscription est gratuite, le paiement vient plus tard."
    >
      <SignupForm />
    </AuthCard>
  );
}
