import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActivePlans, getPlanBySlug } from "@/lib/plans-query";
import { CompanyOnboardingWizard } from "@/components/entreprise/company-onboarding-wizard";

export const metadata: Metadata = { title: "Créer mon entreprise" };

/**
 * Parcours revu (1er août 2026) — assistant à 2 étapes : offre puis
 * entreprise (voir components/entreprise/company-onboarding-wizard.tsx).
 *
 * `?offre=<slug>` (Phase 2quater, 1er août 2026) — lien profond depuis la
 * page d'un évènement (`/evenements/[id]`) pour un utilisateur déjà connecté
 * sans entreprise : même mécanisme que `/inscription?offre=`, mais résolu
 * ici puisqu'il n'y a pas d'étape d'inscription à traverser. Prioritaire
 * sur `User.intendedPlanId` (choisi avant l'inscription, site public).
 */
export default async function CreateCompanyPage({
  searchParams,
}: {
  searchParams: { offre?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (viewer.companyId) redirect(`/entreprises/${viewer.companyId}`);

  const plans = await getActivePlans({ selfServiceOnly: true });

  const deepLinkedPlan = searchParams.offre ? await getPlanBySlug(searchParams.offre) : null;
  const resolvedPlanId = deepLinkedPlan ? deepLinkedPlan.id : viewer.intendedPlanId;

  // Une offre d'évènement (Phase 2quater) n'apparaît pas dans la liste
  // standard (getActivePlans filtre eventId: null par défaut) — on
  // l'ajoute explicitement si c'est elle qui est visée par le lien profond.
  const allPlans =
    deepLinkedPlan && !plans.some((p) => p.id === deepLinkedPlan.id)
      ? [deepLinkedPlan, ...plans]
      : plans;

  const initialPlanId = allPlans.some((p) => p.id === resolvedPlanId) ? resolvedPlanId : null;

  return (
    <div className="flex min-h-screen justify-center bg-surface p-6 pt-16">
      <CompanyOnboardingWizard plans={allPlans} initialPlanId={initialPlanId} />
    </div>
  );
}
