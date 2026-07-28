import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { EmptyState } from "@/components/ui/empty-state";
import { CreditPurchaseActions } from "@/components/admin/credit-purchase-actions";
import { formatAriary, formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Crédits" };

/**
 * E8-T07 (amorcé par E6-T05) — validation manuelle des achats de crédits en
 * attente. Le reste d'E8-T07 (vue des soldes par membre, email upsell) n'est
 * pas construit ici : voir /admin/membres/[id] pour l'attribution manuelle
 * de crédits (E8-T04), déjà en place.
 */
export default async function AdminCreditsPage() {
  try {
    await requireAdmin("credits");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const pending = await prisma.creditPurchase.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-navy">Achats de crédits en attente</h1>

      {pending.length === 0 ? (
        <EmptyState title="Aucun achat en attente" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Membre</th>
                <th className="px-4 py-2.5 text-left">Pack</th>
                <th className="px-4 py-2.5 text-left">Montant</th>
                <th className="px-4 py-2.5 text-left">Mode</th>
                <th className="px-4 py-2.5 text-left">Demandé le</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy">{purchase.user.name}</p>
                    <p className="text-xs text-text-muted">{purchase.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{purchase.credits} crédits</td>
                  <td className="px-4 py-3">{formatAriary(purchase.priceAr)}</td>
                  <td className="px-4 py-3 text-text-muted">{purchase.paymentMethod}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDateFr(purchase.createdAt)}</td>
                  <td className="px-4 py-3">
                    <CreditPurchaseActions purchaseId={purchase.id} />
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
