import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { timezoneLabel } from "@/lib/event-timezone";
import { formatDateFr } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Admin — Créneaux rendez-vous" };

/**
 * Module 21 lot 2 (8 oct. 2026) — point d'entrée « Créneaux rendez-vous »
 * (conception/21 §3.0 étape 4) : l'admin choisit un événement déjà créé,
 * puis gère ses créneaux sur `/admin/evenements/[id]/creneaux`.
 */
export default async function AdminMeetingsPage() {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const events = await prisma.event.findMany({
    where: { isOnline: false, status: { in: ["DRAFT", "PUBLISHED"] } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      title: true,
      date: true,
      endDate: true,
      timezone: true,
      status: true,
      meetingSetup: { select: { status: true } },
      _count: { select: { meetingSlots: true } },
    },
  });
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-navy">Créneaux rendez-vous</h1>
        <p className="text-sm text-text-muted">
          Choisissez un événement pour déployer ses créneaux de rendez-vous B2B. Ils sont distincts
          du Programme (agenda multi-salles).
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="Aucun événement en présentiel"
          description="Créez d'abord un événement (non en ligne) depuis la page Événements."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-3">Événement</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Créneaux</th>
                <th className="px-4 py-3">Statut des créneaux</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => {
                const over = (event.endDate ?? event.date) < now;
                const setupStatus = event.meetingSetup?.status;
                return (
                  <tr key={event.id}>
                    <td className="px-4 py-3 font-semibold text-navy">
                      {event.title}
                      {event.status === "DRAFT" && (
                        <span className="ml-2 text-xs font-normal text-text-muted">
                          (brouillon)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {formatDateFr(event.date, event.timezone)}
                      <span className="block text-xs">{timezoneLabel(event.timezone)}</span>
                    </td>
                    <td className="px-4 py-3">{event._count.meetingSlots}</td>
                    <td className="px-4 py-3">
                      {over ? (
                        <Badge variant="approved">Terminé</Badge>
                      ) : setupStatus === "PUBLISHED" ? (
                        <Badge variant="active">Publiés</Badge>
                      ) : setupStatus === "DRAFT" ? (
                        <Badge variant="draft">Brouillon</Badge>
                      ) : (
                        <Badge variant="secondary">Non configuré</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/evenements/${event.id}/creneaux`}
                        className="font-semibold text-navy-mid"
                      >
                        Gérer les créneaux →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
