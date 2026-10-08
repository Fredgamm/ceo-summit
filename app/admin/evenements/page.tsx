import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { RegistrationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateFr } from "@/lib/utils";
import { AddButton } from "@/components/ui/add-button";

export const metadata: Metadata = { title: "Admin — Événements" };

const STATUS_BADGE: Record<string, "draft" | "active" | "refused" | "approved"> = {
  DRAFT: "draft",
  PUBLISHED: "active",
  CANCELLED: "refused",
  COMPLETED: "approved",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  CANCELLED: "Annulé",
  COMPLETED: "Terminé",
};

const TAKEN_STATUSES: RegistrationStatus[] = ["CONFIRMED", "PENDING_PAYMENT"];

/** E3-T05 — liste événements admin (tous statuts, wireframe bo-evenements.html réduit). */
export default async function AdminEventsPage() {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const events = await prisma.event.findMany({
    orderBy: { date: "desc" },
    include: {
      _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <AddButton href="/admin/evenements/nouveau">Nouvel événement</AddButton>
      </div>

      {events.length === 0 ? (
        <EmptyState title="Aucun événement" description="Créez le premier événement CEO Summit." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Événement</th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Lieu</th>
                <th className="px-4 py-2.5 text-left">Inscrits</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 font-semibold text-navy">{event.title}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {formatDateFr(event.date, event.timezone)}
                  </td>
                  <td className="px-4 py-3 text-text-mid">
                    {event.isOnline ? "En ligne" : event.location}
                  </td>
                  <td className="px-4 py-3 text-text-mid">
                    {event._count.registrations}/{event.capacity}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[event.status]}>{STATUS_LABEL[event.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/evenements/${event.id}/inscrits`}
                        className="text-xs font-semibold text-navy-mid"
                      >
                        Inscrits
                      </Link>
                      <Link
                        href={`/admin/evenements/${event.id}/editer`}
                        className="text-xs font-semibold text-navy-mid"
                      >
                        Éditer
                      </Link>
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
