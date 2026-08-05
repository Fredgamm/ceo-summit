import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActivePlans } from "@/lib/plans-query";
import { PlanPicker } from "@/components/entreprise/plan-picker";

export const metadata: Metadata = { title: "Choisir une offre" };

/** Phase 2 offres/paiement (30 juillet 2026) — choix d'offre par l'admin entreprise. */
export default async function CompanyPlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (!viewer.companyId) redirect("/entreprise/creer");

  const company = await prisma.company.findUnique({
    where: { id: viewer.companyId },
    include: { subscription: true },
  });
  if (!company) redirect("/entreprise/creer");
  if (company.companyAdminId !== viewer.id) redirect(`/entreprises/${company.id}`);
  if (company.subscription?.status === "ACTIVE") redirect(`/entreprises/${company.id}`);
  if (company.subscription?.status === "PENDING_REVIEW") redirect("/entreprise/paiement");

  const plans = await getActivePlans({ selfServiceOnly: true });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-xl font-bold text-navy">Choisir une offre</h1>
      <p className="mb-4 text-sm text-text-muted">
        Pour {company.name} — l&apos;accès de toute l&apos;équipe s&apos;active une fois le paiement
        confirmé.
      </p>
      <PlanPicker
        companyId={company.id}
        plans={plans}
        currentPlanId={company.subscription?.planId}
      />
    </div>
  );
}
