import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, FileText } from "lucide-react";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { formatDayKey, timezoneLabel } from "@/lib/event-timezone";
import { groupFieldList, loadAdminMeetings, parseAdminMeetingFilters } from "@/lib/meeting-admin";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Liste terrain des rendez-vous B2B" };

/**
 * Module 21 lot 9 (3 nov. 2026) — liste terrain : pour chaque créneau, qui
 * rencontre qui et comment les joindre, pour l'équipe sur place. Seuls les
 * rendez-vous confirmés ou terminés y figurent. La version à imprimer est le
 * PDF (A4) : la page, avec le menu de l'admin, s'imprimerait mal.
 */
export default async function AdminFieldListPage(props: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ jour?: string }>;
}) {
  const { eventId } = await props.params;
  const query = await props.searchParams;
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  // Les rendez-vous qui auront lieu : confirmés et terminés.
  const filters = parseAdminMeetingFilters({ jour: query.jour });
  const data = await loadAdminMeetings(eventId, filters);
  if (!data) notFound();
  const groups = groupFieldList(data);
  const { event } = data;

  const exportHref = (format: "csv" | "pdf") => {
    const params = new URLSearchParams({ vue: "terrain", format });
    if (filters.day) params.set("jour", filters.day);
    return `/api/admin/rendez-vous/${eventId}/export?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/admin/rendez-vous/${eventId}`}
          className="text-sm font-semibold text-navy-mid"
        >
          ← Suivi des rendez-vous
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">Liste terrain</h1>
            <p className="text-sm text-text-muted">
              {event.title} · {event.zone || "zone non définie"} · horaires en{" "}
              {timezoneLabel(event.timezone)}
            </p>
            {event.accessInstructions && (
              <p className="text-xs text-text-muted">{event.accessInstructions}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={exportHref("pdf")}>
                <FileText className="h-4 w-4" aria-hidden /> PDF à imprimer
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={exportHref("csv")}>
                <Download className="h-4 w-4" aria-hidden /> CSV
              </a>
            </Button>
          </div>
        </div>
      </div>

      {data.days.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Filtrer par jour">
          {[
            { key: "", label: "Tous les jours" },
            ...data.days.map((d) => ({ key: d, label: formatDayKey(d) })),
          ].map((d) => (
            <Link
              key={d.key}
              href={`/admin/rendez-vous/${eventId}/terrain${d.key ? `?jour=${d.key}` : ""}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium",
                (filters.day ?? "") === d.key
                  ? "border-navy bg-navy text-white"
                  : "border-border bg-white text-text-mid hover:border-navy/40"
              )}
            >
              {d.label}
            </Link>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="Aucun rendez-vous confirmé"
          description="La liste terrain se remplit au fur et à mesure que les participants acceptent des demandes."
        />
      ) : (
        groups.map((day) => (
          <section key={day.dayKey} className="rounded-lg border border-border bg-white p-4">
            <h2 className="mb-3 text-xs font-bold uppercase text-gold">{day.label}</h2>
            <div className="flex flex-col gap-3">
              {day.slots.map((slot) => (
                <div key={slot.range} className="grid gap-2 md:grid-cols-[8rem_1fr]">
                  <p className="text-sm font-bold text-navy">{slot.range}</p>
                  <ul className="flex flex-col gap-2">
                    {slot.meetings.map((m) => (
                      <li
                        key={m.id}
                        className="grid gap-2 rounded-md bg-surface-2 p-3 text-sm md:grid-cols-2"
                      >
                        {[m.requester, m.recipient].map((p, i) => (
                          <div key={i}>
                            <p className="font-semibold text-navy">{p.name}</p>
                            <p className="text-xs text-text-muted">
                              {[p.company, p.title].filter(Boolean).join(" · ")}
                            </p>
                            {p.phone && <p className="text-xs text-text-mid">{p.phone}</p>}
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
