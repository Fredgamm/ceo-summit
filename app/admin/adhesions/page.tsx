import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAriary, formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Adhésions" };

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "En attente de paiement",
  PENDING_REVIEW: "À valider",
  ACTIVE: "Active",
  EXPIRED: "Expirée",
  SUSPENDED: "Suspendue",
  CANCELLED: "Annulée",
};
const STATUS_BADGE: Record<string, "active" | "pending" | "refused" | "draft"> = {
  PENDING_PAYMENT: "pending",
  PENDING_REVIEW: "pending",
  ACTIVE: "active",
  EXPIRED: "refused",
  SUSPENDED: "refused",
  CANCELLED: "refused",
};

/**
 * Phase 2ter (1er août 2026) — file d'adhésions individuelles à valider,
 * miroir de /admin/entreprises. Ne liste que les Memberships issus du
 * parcours self-service (en attente de paiement, ou ayant déjà une
 * preuve soumise) — les adhésions historiques créées par Evolia, déjà
 * ACTIVE sans jamais être passées par ce parcours, restent dans
 * /admin/membres et n'ont pas leur place ici.
 */
export default async function AdminAdhesionsPage() {
  try {
    await requireAdmin("adhesions");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const memberships = await prisma.membership.findMany({
    where: {
      OR: [{ status: { in: ["PENDING_PAYMENT", "PENDING_REVIEW"] } }, { payments: { some: {} } }],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { id: true, name: true } },
      plan: { select: { name: true, priceAr: true } },
      payments: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const pendingReviewCount = memberships.filter((m) => m.status === "PENDING_REVIEW").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy">Adhésions individuelles</h1>
        <p className="text-sm text-text-muted">
          {memberships.length} adhésion(s) · {pendingReviewCount} à valider
        </p>
      </div>

      {memberships.length === 0 ? (
        <EmptyState title="Aucune adhésion individuelle en cours pour l'instant" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Membre</th>
                <th className="px-4 py-2.5 text-left">Offre</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5 text-left">Mise à jour</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {memberships.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-semibold text-navy">{m.user.name}</td>
                  <td className="px-4 py-3 text-text-mid">
                    {m.plan ? `${m.plan.name} · ${formatAriary(m.plan.priceAr)}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[m.status] ?? "draft"}>
                      {STATUS_LABEL[m.status] ?? m.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-mid">{formatDateFr(m.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/adhesions/${m.id}`}>Voir</Link>
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
