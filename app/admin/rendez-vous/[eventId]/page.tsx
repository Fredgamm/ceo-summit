import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, FileText, ListChecks } from "lucide-react";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { formatDayKey, formatTimeRangeInZone, timezoneLabel } from "@/lib/event-timezone";
import { loadAdminMeetings, parseAdminMeetingFilters } from "@/lib/meeting-admin";
import { MEETING_STATUS_LABEL, type MeetingDisplayStatus } from "@/lib/meeting-booking";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Suivi des rendez-vous B2B" };

/** Même code couleur que « Mes rendez-vous » côté membre. */
const STATUS_BADGE: Record<MeetingDisplayStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-navy-light text-navy ring-navy/30",
  COMPLETED: "bg-slate-100 text-slate-600 ring-slate-200",
  DECLINED: "bg-red-50 text-red-700 ring-red-200",
  EXPIRED: "bg-slate-50 text-slate-500 ring-slate-200",
  WITHDRAWN: "bg-slate-50 text-slate-500 ring-slate-200",
  CANCELLED: "bg-slate-50 text-slate-500 ring-slate-200",
};

const STATUS_ORDER: MeetingDisplayStatus[] = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
  "CANCELLED",
];

/**
 * Module 21 lot 9 (3 nov. 2026) — suivi par l'organisation (conception/21
 * P7) : tous les rendez-vous d'un événement, filtres par statut et par jour,
 * exports CSV et PDF, liste terrain. L'organisation voit toutes les
 * informations des participants, quel que soit le statut.
 */
export default async function AdminEventMeetingsPage(props: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ statut?: string; jour?: string }>;
}) {
  const { eventId } = await props.params;
  const query = await props.searchParams;
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const filters = parseAdminMeetingFilters(query);
  const data = await loadAdminMeetings(eventId, filters);
  if (!data) notFound();
  const { event, days, counts, meetings } = data;
  const tz = event.timezone;

  const href = (next: { statut?: string; jour?: string }) => {
    const params = new URLSearchParams();
    const statut = "statut" in next ? next.statut : filters.status;
    const jour = "jour" in next ? next.jour : filters.day;
    if (statut && statut !== "all") params.set("statut", statut);
    if (jour) params.set("jour", jour);
    const qs = params.toString();
    return `/admin/rendez-vous/${eventId}${qs ? `?${qs}` : ""}`;
  };
  const exportHref = (extra: Record<string, string>) => {
    const params = new URLSearchParams(extra);
    if (filters.status && filters.status !== "all") params.set("statut", filters.status);
    if (filters.day) params.set("jour", filters.day);
    return `/api/admin/rendez-vous/${eventId}/export?${params.toString()}`;
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
      active
        ? "border-navy bg-navy text-white"
        : "border-border bg-white text-text-mid hover:border-navy/40"
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/rendez-vous" className="text-sm font-semibold text-navy-mid">
          ← Créneaux rendez-vous
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">Suivi des rendez-vous B2B</h1>
            <p className="text-sm text-text-muted">
              {event.title} · {event.zone || "zone non définie"} · horaires en {timezoneLabel(tz)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/admin/rendez-vous/${eventId}/terrain${filters.day ? `?jour=${filters.day}` : ""}`}
              >
                <ListChecks className="h-4 w-4" aria-hidden /> Liste terrain
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={exportHref({ format: "csv" })}>
                <Download className="h-4 w-4" aria-hidden /> Export CSV
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={exportHref({ format: "pdf" })}>
                <FileText className="h-4 w-4" aria-hidden /> Export PDF
              </a>
            </Button>
          </div>
        </div>
      </div>

      {days.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Filtrer par jour">
          <Link href={href({ jour: undefined })} className={chip(!filters.day)}>
            Tous les jours
          </Link>
          {days.map((day) => (
            <Link key={day} href={href({ jour: day })} className={chip(filters.day === day)}>
              {formatDayKey(day)}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Filtrer par statut">
        <Link href={href({ statut: undefined })} className={chip(!filters.status)}>
          Tous ({counts.all})
        </Link>
        {STATUS_ORDER.filter((s) => counts[s] > 0 || filters.status === s).map((s) => (
          <Link key={s} href={href({ statut: s })} className={chip(filters.status === s)}>
            {MEETING_STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {meetings.length === 0 ? (
        <EmptyState
          title="Aucun rendez-vous"
          description={
            counts.all === 0
              ? "Aucune demande de rendez-vous n'a encore été envoyée pour cet événement."
              : "Aucun rendez-vous ne correspond à ces filtres."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-3">Créneau</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Demandeur</th>
                <th className="px-4 py-3">Destinataire</th>
                <th className="px-4 py-3">Motif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border align-top">
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-semibold text-navy">{formatDayKey(m.dayKey)}</span>
                    <span className="block text-xs text-text-muted">
                      {formatTimeRangeInZone(m.start, m.end, tz)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                        STATUS_BADGE[m.status]
                      )}
                    >
                      {MEETING_STATUS_LABEL[m.status]}
                    </span>
                  </td>
                  {[m.requester, m.recipient].map((p, i) => (
                    <td key={i} className="px-4 py-3">
                      <Link
                        href={`/membres/${p.id}`}
                        className="font-semibold text-navy hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="block text-xs text-text-muted">
                        {[p.title, p.company].filter(Boolean).join(" · ")}
                      </span>
                      {p.phone && <span className="block text-xs text-text-mid">{p.phone}</span>}
                      {p.email && <span className="block text-xs text-text-mid">{p.email}</span>}
                    </td>
                  ))}
                  <td className="max-w-xs px-4 py-3 text-text-mid">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-text-muted">
        L&apos;organisation voit toutes les coordonnées des participants. Entre eux, le téléphone de
        l&apos;autre ne leur est communiqué qu&apos;après confirmation du rendez-vous.
      </p>
    </div>
  );
}
