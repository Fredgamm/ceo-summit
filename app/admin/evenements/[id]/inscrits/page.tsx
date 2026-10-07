import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAriary, formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Inscrits" };

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "En attente",
  PAID: "Payé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
};

/** E3-T04/E3-T05 — liste des inscrits (wireframe bo-evenement-inscrits.html réduit). */
export default async function EventRegistrationsPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      registrations: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { name: true, email: true, role: true, title: true } },
          plan: { select: { name: true, priceAr: true, pricingMode: true } },
        },
      },
    },
  });
  if (!event) notFound();

  const confirmed = event.registrations.filter((r) => r.paymentStatus === "PAID").length;
  const pending = event.registrations.filter((r) => r.paymentStatus === "PENDING").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/admin/evenements/${event.id}/editer`} className="text-sm text-text-muted">
          ← {event.title}
        </Link>
      </div>

      <div className="rounded-lg bg-navy p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-gold">{formatDateFr(event.date)}</p>
            <h1 className="text-xl font-bold">{event.title}</h1>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-2xl font-bold">{event.registrations.length}</p>
              <p className="text-xs text-white/50">Inscrits</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gold">{event.capacity}</p>
              <p className="text-xs text-white/50">Capacité</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-emerald-700">{confirmed}</p>
          <p className="text-sm text-text-muted">Paiements confirmés</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-red-700">{pending}</p>
          <p className="text-sm text-text-muted">Paiements en attente</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase text-text-muted">Liste des inscrits</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/evenements/${event.id}/export`}>↓ Export CSV</a>
          </Button>
        </div>
      </div>

      {event.registrations.length === 0 ? (
        <EmptyState title="Aucun inscrit pour l'instant" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Participant</th>
                <th className="px-4 py-2.5 text-left">Offre</th>
                <th className="px-4 py-2.5 text-left">Inscrit le</th>
                <th className="px-4 py-2.5 text-left">Paiement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {event.registrations.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy">{r.user.name}</p>
                    <p className="text-xs text-text-muted">{r.user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-text-mid">{r.plan?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDateFr(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={r.paymentStatus === "PAID" ? "text-emerald-700" : "text-amber-700"}
                    >
                      {PAYMENT_LABEL[r.paymentStatus]}
                      {r.paymentStatus === "PAID" &&
                        (r.plan
                          ? ` · ${formatAriary(r.plan.priceAr)}`
                          : event.price > 0 && ` · ${formatAriary(event.price)}`)}
                    </span>
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
