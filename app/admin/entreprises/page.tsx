import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAriary, formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Entreprises" };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Aucune offre",
  PENDING_PAYMENT: "En attente de paiement",
  PENDING_REVIEW: "À valider",
  ACTIVE: "Active",
  EXPIRED: "Expirée",
  SUSPENDED: "Suspendue",
  CANCELLED: "Annulée",
};
const STATUS_BADGE: Record<string, "active" | "pending" | "refused" | "draft"> = {
  DRAFT: "draft",
  PENDING_PAYMENT: "pending",
  PENDING_REVIEW: "pending",
  ACTIVE: "active",
  EXPIRED: "refused",
  SUSPENDED: "refused",
  CANCELLED: "refused",
};

/** Phase 2 offres/paiement (30 juillet 2026) — file d'entreprises à valider. */
export default async function AdminEntreprisesPage() {
  try {
    await requireAdmin("entreprises");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const subscriptions = await prisma.companySubscription.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      company: { select: { id: true, name: true, companyAdmin: { select: { name: true } } } },
      plan: { select: { name: true, priceAr: true, pricingMode: true } },
      payments: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const pendingReviewCount = subscriptions.filter((s) => s.status === "PENDING_REVIEW").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy">Entreprises</h1>
        <p className="text-sm text-text-muted">
          {subscriptions.length} abonnement(s) · {pendingReviewCount} à valider
        </p>
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState title="Aucune entreprise n'a encore choisi d'offre" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Entreprise</th>
                <th className="px-4 py-2.5 text-left">Admin</th>
                <th className="px-4 py-2.5 text-left">Offre</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5 text-left">Mise à jour</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3 font-semibold text-navy">{sub.company.name}</td>
                  <td className="px-4 py-3 text-text-mid">
                    {sub.company.companyAdmin?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-mid">
                    {sub.plan.name} ·{" "}
                    {sub.plan.pricingMode === "TIERED_GROUP"
                      ? "tarif dégressif par groupe"
                      : formatAriary(sub.plan.priceAr)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[sub.status]}>{STATUS_LABEL[sub.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-mid">{formatDateFr(sub.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/entreprises/${sub.company.id}`}>Voir</Link>
                    </Button>
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
