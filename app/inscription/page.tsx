import type { Metadata } from "next";
import Image from "next/image";

import { getPlanBySlug } from "@/lib/plans-query";
import { formatAriary } from "@/lib/utils";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

type PageProps = { searchParams: { offre?: string } };

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
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const plan = searchParams.offre ? await getPlanBySlug(searchParams.offre) : null;
  if (!plan) return { title: "Inscription" };

  const title = plan.event ? `${plan.name} — ${plan.event.title}` : plan.name;
  const description =
    plan.description ??
    `Rejoignez CEO Summit avec l'offre ${plan.name} — ${formatAriary(plan.priceAr)}.`;
  const image = plan.event?.imageUrl;

  // UC-11 (5 août 2026) — métadonnées Open Graph pour que le lien partagé
  // (bouton "Partager" de /admin/plans) affiche une preview riche sur les
  // réseaux sociaux plutôt que le titre générique du site.
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function SignupPage({ searchParams }: PageProps) {
  const intendedPlan = searchParams.offre ? await getPlanBySlug(searchParams.offre) : null;

  return (
    <AuthCard
      title="Créer mon compte"
      subtitle="Rejoignez CEO Summit — l'inscription est gratuite, le paiement vient plus tard."
    >
      {intendedPlan?.event?.imageUrl && (
        <div className="relative mb-4 h-32 w-full overflow-hidden rounded-md">
          <Image
            src={intendedPlan.event.imageUrl}
            alt={intendedPlan.event.title}
            fill
            className="object-cover"
          />
        </div>
      )}
      {intendedPlan && (intendedPlan.description || intendedPlan.eligibilityNote) && (
        <div className="mb-4 rounded-md bg-surface p-3 text-sm text-text-mid">
          {intendedPlan.event && (
            <p className="mb-1 font-semibold text-navy">{intendedPlan.event.title}</p>
          )}
          {intendedPlan.description && <p>{intendedPlan.description}</p>}
          {intendedPlan.eligibilityNote && (
            <p className="mt-1 text-xs text-text-muted">{intendedPlan.eligibilityNote}</p>
          )}
        </div>
      )}
      <SignupForm intendedPlan={intendedPlan} />
    </AuthCard>
  );
}
