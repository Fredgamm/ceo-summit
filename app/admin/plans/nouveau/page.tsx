import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { PlanForm } from "@/components/admin/plans/plan-form";

export const metadata: Metadata = { title: "Admin — Nouvelle offre" };

export default async function NewPlanPage() {
  try {
    await requireAdmin("plans");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const events = await prisma.event.findMany({
    where: { status: { not: "CANCELLED" } },
    orderBy: { date: "desc" },
    select: { id: true, title: true },
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-navy">Créer une offre</h1>
      <PlanForm mode="create" events={events} />
    </div>
  );
}
