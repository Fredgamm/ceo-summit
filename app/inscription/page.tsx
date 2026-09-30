import type { Metadata } from "next";
import Image from "next/image";

import { cleanPlanName, getActivePlans, getPlanBySlug } from "@/lib/plans-query";
import { getReferentialLabels } from "@/lib/referentials-query";
import { getEurToArRate } from "@/lib/currency-conversion";
import { CompanySignupWizard } from "@/components/auth/company-signup-wizard";
import { formatAriary } from "@/lib/utils";

type PageProps = { searchParams: { offre?: string } };

/**
 * Checkout hybride Evolia (conception/07/09, 3 septembre 2026) — page
 * d'offres in-app + inscription du gestionnaire/entreprise, remplace
 * l'ancien `/inscription` (compte seul, retiré le 12 août) sur le même
 * chemin d'URL : la plateforme garde la main sur cette étape, Evolia ne
 * traite que le paiement (voir `/entreprise/paiement`, plus loin dans le
 * parcours).
 *
 * `?offre=<slug>` — lien profond depuis le site public vitrine ou depuis
 * un partage admin (`/admin/plans`). Résolu ici, côté serveur : un slug
 * inconnu/désactivé/sponsoring retombe simplement sur le catalogue complet,
 * pas une erreur bloquante.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const plan = searchParams.offre ? await getPlanBySlug(searchParams.offre) : null;
  if (!plan) return { title: "Créer mon compte" };

  const name = cleanPlanName(plan.name);
  const title = plan.event ? `${name} — ${plan.event.title}` : name;
  const description =
    plan.description ??
    `Rejoignez CEO Summit avec l'offre ${name} — ${formatAriary(plan.priceAr)}.`;

  return { title, description };
}

export default async function InscriptionPage({ searchParams }: PageProps) {
  const [rawIntendedPlan, rawPlans, sectors, countries, liveEurToArRate] = await Promise.all([
    searchParams.offre ? getPlanBySlug(searchParams.offre) : null,
    getActivePlans({ selfServiceOnly: true }),
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
    getEurToArRate(),
  ]);
  // Audit MVP (25 septembre 2026) — affichage défensif : une offre saisie
  // avec du markdown dans son nom (« Early Bird** … ») s'affiche proprement.
  const plans = rawPlans.map((p) => ({ ...p, name: cleanPlanName(p.name) }));
  const intendedPlan = rawIntendedPlan
    ? { ...rawIntendedPlan, name: cleanPlanName(rawIntendedPlan.name) }
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-[760px] rounded-lg border border-border bg-white p-8 shadow-card-md">
        <div className="mb-6 text-center">
          <Image
            src="/logo/ceo-summit-logo.png"
            alt="CEO Summit"
            width={160}
            height={77}
            className="mx-auto mb-4"
          />
          <h1 className="text-xl font-bold text-navy">Créer mon compte</h1>
          <p className="mt-1 text-sm text-text-muted">
            Rejoignez CEO Summit — le paiement se fait à l&apos;étape suivante.
          </p>
        </div>

        <CompanySignupWizard
          plans={plans}
          intendedPlan={intendedPlan}
          sectors={sectors}
          countries={countries}
          liveEurToArRate={liveEurToArRate}
        />
      </div>
    </div>
  );
}
