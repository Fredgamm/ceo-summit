import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { speakersToText } from "@/lib/event-content";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { EventSessionActions } from "@/components/admin/events/event-session-actions";
import { AddButton } from "@/components/ui/add-button";
import {
  formatDayKey,
  formatTimeRangeInZone,
  timezoneLabel,
  zonedDayKey,
} from "@/lib/event-timezone";

export const metadata: Metadata = { title: "Admin — Agenda de l'évènement" };

/**
 * E10 — agenda dynamique multi-salles (5 août 2026). Sessions groupées par
 * jour calendaire (date de `startTime`), triées par horaire à l'intérieur
 * de chaque jour — des sessions au même horaire dans des salles
 * différentes s'affichent donc côte à côte dans l'ordre où elles ont été
 * créées, sans logique de grille horizontale par salle (garde la page
 * simple ; une vraie grille multi-colonnes serait une itération séparée
 * si le nombre de salles en parallèle le justifie).
 */
export default async function EventAgendaPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const [event, sessions] = await Promise.all([
    prisma.event.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, timezone: true },
    }),
    prisma.eventSession.findMany({
      where: { eventId: params.id },
      orderBy: { startTime: "asc" },
    }),
  ]);
  if (!event) notFound();

  const days = new Map<string, typeof sessions>();
  for (const session of sessions) {
    // Module 21 D19 — jour et heures dans le fuseau de l'événement.
    const dayKey = zonedDayKey(session.startTime, event.timezone);
    const existing = days.get(dayKey) ?? [];
    existing.push(session);
    days.set(dayKey, existing);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/admin/evenements/${event.id}/editer`} className="text-sm text-text-muted">
            ← {event.title}
          </Link>
          <h1 className="text-xl font-bold text-navy">Agenda multi-salles</h1>
          <p className="text-xs text-text-muted">Horaires en {timezoneLabel(event.timezone)}</p>
        </div>
        <AddButton href={`/admin/evenements/${event.id}/agenda/nouveau`}>
          Ajouter une session
        </AddButton>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          title="Aucune session"
          description="Ajoutez des créneaux (horaire, salle, intervenants) pour construire l'agenda."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...days.entries()].map(([dayKey, daySessions]) => (
            <div key={dayKey}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-muted">
                {formatDayKey(dayKey)}
              </h2>
              <div className="flex flex-col gap-3">
                {daySessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border bg-white p-4"
                  >
                    <div className="flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span className="font-semibold text-navy">
                          {formatTimeRangeInZone(
                            session.startTime,
                            session.endTime,
                            event.timezone
                          )}
                        </span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-navy">
                          {session.room}
                        </span>
                      </div>
                      <p className="font-semibold text-navy">{session.title}</p>
                      {session.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-text-mid">
                          {session.description}
                        </p>
                      )}
                      {speakersToText(session.speakers) && (
                        <p className="mt-1 text-xs text-text-muted">
                          {speakersToText(session.speakers).split("\n").join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/evenements/${event.id}/agenda/${session.id}/editer`}>
                          Éditer
                        </Link>
                      </Button>
                      <EventSessionActions sessionId={session.id} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
