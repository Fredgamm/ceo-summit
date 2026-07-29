import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { EmptyState } from "@/components/ui/empty-state";
import { ServiceListingActions } from "@/components/admin/service-listing-actions";
import { formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Catalogue services" };

/** E5-T03 — "Modération admin avant publication". */
export default async function AdminServicesPage() {
  try {
    await requireAdmin("services");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const pending = await prisma.serviceListing.findMany({
    where: { status: "PENDING_MODERATION" },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, email: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-navy">Fiches services en attente</h1>

      {pending.length === 0 ? (
        <EmptyState title="Aucune fiche en attente" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Prestataire</th>
                <th className="px-4 py-2.5 text-left">Catégorie</th>
                <th className="px-4 py-2.5 text-left">Titre</th>
                <th className="px-4 py-2.5 text-left">Soumise le</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((listing) => (
                <tr key={listing.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy">{listing.author.name}</p>
                    <p className="text-xs text-text-muted">{listing.author.email}</p>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{listing.category}</td>
                  <td className="px-4 py-3">{listing.title}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDateFr(listing.createdAt)}</td>
                  <td className="px-4 py-3">
                    <ServiceListingActions listingId={listing.id} />
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
