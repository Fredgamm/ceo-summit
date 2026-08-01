import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActivePlans } from "@/lib/plans-query";
import { CompanyOnboardingWizard } from "@/components/entreprise/company-onboarding-wizard";

export const metadata: Metadata = { title: "Créer mon entreprise" };

/**
 * Parcours revu (1er août 2026) — assistant à 2 étapes : offre puis
 * entreprise (voir components/entreprise/company-onboarding-wizard.tsx).
 */
export default async function CreateCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (viewer.companyId) redirect(`/entreprises/${viewer.companyId}`);

  const plans = await getActivePlans("COMPANY");

  return (
    <div className="flex min-h-screen justify-center bg-surface p-6 pt-16">
      <CompanyOnboardingWizard plans={plans} />
    </div>
  );
}
