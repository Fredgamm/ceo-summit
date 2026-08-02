import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { PlanForm } from "@/components/admin/plans/plan-form";

export const metadata: Metadata = { title: "Admin — Nouvelle offre" };

/** `?eventId=` (Phase 2quater, 1er août 2026) — pré-sélectionne l'évènement quand on arrive depuis sa fiche admin. */
export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: { eventId?: string };
}) {
  try {
    await requireAdmin("plans");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const events = await prisma.event.findMany({
    select: { id: true, title: true },
    orderBy: { date: "desc" },
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-navy">Créer une offre</h1>
      <PlanForm
        mode="create"
        events={events}
        initialValues={searchParams.eventId ? { eventId: searchParams.eventId } : undefined}
      />
    </div>
  );
}
