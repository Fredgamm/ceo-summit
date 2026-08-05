import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getAllPlans } from "@/lib/plans-query";
import { formatAriary } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanAdminActions } from "@/components/admin/plans/plan-admin-actions";

export const metadata: Metadata = { title: "Admin — Offres" };

/**
 * Phase 1 offres dynamiques — catalogue d'offres créables librement par
 * l'admin. `?eventId=` (Phase 2quater, 1er août 2026) filtre aux offres
 * d'un évènement précis, arrivée depuis sa fiche admin.
 */
export default async function AdminPlansPage({
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

  const [plans, event] = await Promise.all([
    getAllPlans(searchParams.eventId),
    searchParams.eventId
      ? prisma.event.findUnique({ where: { id: searchParams.eventId }, select: { title: true } })
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">
            {event ? `Offres — ${event.title}` : "Offres"}
          </h1>
          <p className="text-sm text-text-muted">
            {plans.length} offre(s)
            {event && (
              <>
                {" · "}
                <Link href="/admin/plans" className="text-navy-mid">
                  Voir toutes les offres
                </Link>
              </>
            )}
          </p>
        </div>
        <Button asChild>
          <Link
            href={
              searchParams.eventId
                ? `/admin/plans/nouveau?eventId=${searchParams.eventId}`
                : "/admin/plans/nouveau"
            }
          >
            + Créer une offre
          </Link>
        </Button>
      </div>

      {plans.length === 0 ? (
        <EmptyState title="Aucune offre" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Offre</th>
                <th className="px-4 py-2.5 text-left">Type</th>
                <th className="px-4 py-2.5 text-left">Prix</th>
                <th className="px-4 py-2.5 text-left">Crédits inclus</th>
                <th className="px-4 py-2.5 text-left">Rang</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy">{plan.name}</p>
                    {plan.maxTeamMembers && (
                      <p className="text-xs text-text-muted">
                        Max {plan.maxTeamMembers} collaborateur(s)
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-mid">
                    {plan.eventId ? "Offre d'évènement" : "Offre plateforme"}
                  </td>
                  <td className="px-4 py-3 text-text-mid">{formatAriary(plan.priceAr)}</td>
                  <td className="px-4 py-3 text-text-mid">
                    {plan.hasUnlimitedCredits ? "Illimité" : plan.includedCredits}
                  </td>
                  <td className="px-4 py-3 text-text-mid">{plan.rank}</td>
                  <td className="px-4 py-3">
                    <Badge variant={plan.isActive ? "active" : "draft"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/plans/${plan.id}/editer`}>Éditer</Link>
                      </Button>
                      <PlanAdminActions planId={plan.id} isActive={plan.isActive} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
