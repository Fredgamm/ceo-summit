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

  const [plan, events, platformPlans] = await Promise.all([
    prisma.plan.findUnique({ where: { id: params.id } }),
    prisma.event.findMany({ select: { id: true, title: true }, orderBy: { date: "desc" } }),
    prisma.plan.findMany({
      where: { eventId: null, isActive: true, id: { not: params.id } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!plan) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-navy">Éditer {plan.name}</h1>
      <PlanForm
        mode="edit"
        planId={plan.id}
        events={events}
        platformPlans={platformPlans}
        initialValues={{
          name: plan.name,
          slug: plan.slug,
          description: plan.description ?? "",
          priceAr: plan.priceAr,
          maxTeamMembers: plan.maxTeamMembers,
          minParticipants: plan.minParticipants,
          pricingMode: plan.pricingMode,
          includedSeats: plan.includedSeats,
          includedCredits: plan.includedCredits,
          hasUnlimitedCredits: plan.hasUnlimitedCredits,
          rank: plan.rank,
          eligibilityNote: plan.eligibilityNote ?? "",
          isActive: plan.isActive,
          isSelfService: plan.isSelfService,
          displayOrder: plan.displayOrder,
          eventId: plan.eventId ?? "",
          linkedPlatformPlanId: plan.linkedPlatformPlanId ?? "",
        }}
      />
    </div>
  );
}
