import type { Metadata } from "next";

import { cleanPlanName, getActivePlans, getPlanBySlug } from "@/lib/plans-query";
import { getReferentialLabels } from "@/lib/referentials-query";
import { getEurToArRate } from "@/lib/currency-conversion";
import { CompanySignupWizard } from "@/components/auth/company-signup-wizard";
import { formatEuro, planPriceEur } from "@/lib/utils";

type PageProps = { searchParams: Promise<{ offre?: string }> };

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
export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const plan = searchParams.offre ? await getPlanBySlug(searchParams.offre) : null;
  if (!plan) return { title: "Créer mon compte" };

  const name = cleanPlanName(plan.name);
  const title = plan.event ? `${name} — ${plan.event.title}` : name;
  const description =
    plan.description ??
    `Rejoignez CEO Summit avec l'offre ${name} — ${formatEuro(planPriceEur(plan, await getEurToArRate()))}.`;

  return { title, description };
}

export default async function InscriptionPage(props: PageProps) {
  const searchParams = await props.searchParams;
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
    <CompanySignupWizard
      plans={plans}
      intendedPlan={intendedPlan}
      sectors={sectors}
      countries={countries}
      liveEurToArRate={liveEurToArRate}
    />
  );
}
