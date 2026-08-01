import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { PlanForm } from "@/components/admin/plans/plan-form";

export const metadata: Metadata = { title: "Admin — Éditer une offre" };

export default async function EditPlanPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("plans");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-navy">Éditer {plan.name}</h1>
      <PlanForm
        mode="edit"
        planId={plan.id}
        initialValues={{
          name: plan.name,
          slug: plan.slug,
          description: plan.description ?? "",
          scope: plan.scope,
          priceAr: plan.priceAr,
          maxTeamMembers: plan.maxTeamMembers,
          minParticipants: plan.minParticipants,
          includedCredits: plan.includedCredits,
          hasUnlimitedCredits: plan.hasUnlimitedCredits,
          rank: plan.rank,
          eligibilityNote: plan.eligibilityNote ?? "",
          isActive: plan.isActive,
          isSelfService: plan.isSelfService,
          displayOrder: plan.displayOrder,
        }}
      />
    </div>
  );
}
