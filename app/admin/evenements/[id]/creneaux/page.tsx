import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import {
  formatDayKey,
  formatTimeRangeInZone,
  timezoneLabel,
  zonedDayKey,
} from "@/lib/event-timezone";
import { eventDayKeys } from "@/lib/meeting-slots";
import { MEETING_EVENT_TYPE } from "@/lib/meeting-participation";
import { formatDateFr } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MeetingSetupForm } from "@/components/admin/meetings/meeting-setup-form";
import { MeetingGridForm } from "@/components/admin/meetings/meeting-grid-form";
import { MeetingSlotAddForm } from "@/components/admin/meetings/meeting-slot-add-form";
import { MeetingSlotActions } from "@/components/admin/meetings/meeting-slot-actions";
import { MeetingPublishButton } from "@/components/admin/meetings/meeting-publish-button";

export const metadata: Metadata = { title: "Admin — Créneaux rendez-vous" };

const SLOT_BADGE = {
  DRAFT: { variant: "draft", label: "Brouillon" },
  PUBLISHED: { variant: "active", label: "Publié" },
  DISABLED: { variant: "refused", label: "Désactivé" },
} as const;

/**
 * Module 21 lot 2 (8 oct. 2026) — créneaux de rendez-vous B2B d'un
 * événement (conception/21 §3.0 étape 4, P1). Option distincte du
 * Programme (agenda multi-salles). Heures dans le fuseau de l'événement.
 */
export default async function EventMeetingSlotsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      date: true,
      endDate: true,
      timezone: true,
      isOnline: true,
      type: true,
      meetingSetup: true,
      meetingSlots: {
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          _count: {
            select: {
              participantSlots: { where: { status: { in: ["FREE", "PENDING", "BOOKED"] } } },
              bookings: true,
            },
          },
          bookings: {
            where: { status: { in: ["PENDING", "CONFIRMED"] } },
            select: { status: true },
          },
        },
      },
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });
  if (!event) notFound();

  const tzLabel = timezoneLabel(event.timezone);
  const days = eventDayKeys(event.date, event.endDate, event.timezone);
  const setup = event.meetingSetup;
  const published = setup?.status === "PUBLISHED";
  const isOver = (event.endDate ?? event.date) < new Date();
  // Créneaux réservés aux « Summit annuel » sur place (8 oct. 2026).
  const notSummit = event.type !== MEETING_EVENT_TYPE;
  const editable = !event.isOnline && !notSummit && !isOver;
  const slots = event.meetingSlots;
  const draftCount = slots.filter((s) => s.status === "DRAFT").length;

  const slotsByDay = new Map<string, typeof slots>();
  for (const slot of slots) {
    const key = zonedDayKey(slot.startTime, event.timezone);
    slotsByDay.set(key, [...(slotsByDay.get(key) ?? []), slot]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/admin/evenements/${event.id}/editer`} className="text-sm text-text-muted">
            ← {event.title}
          </Link>
          <h1 className="text-xl font-bold text-navy">Créneaux rendez-vous</h1>
          <p className="text-xs text-text-muted">
            Horaires en {tzLabel} ·{" "}
            <Link
              href={`/admin/evenements/${event.id}/editer`}
              className="font-semibold text-navy-mid"
            >
              Modifier le fuseau dans l&apos;événement →
            </Link>
          </p>
        </div>
        {setup && editable && (
          <MeetingPublishButton
            eventId={event.id}
            draftCount={draftCount}
            alreadyPublished={published}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-navy">{slots.length}</p>
          <p className="text-sm text-text-muted">Créneaux</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-navy">{days.length}</p>
          <p className="text-sm text-text-muted">Jour(s) d&apos;événement</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-navy">{event._count.registrations}</p>
          <p className="text-sm text-text-muted">Participants inscrits</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-sm font-bold text-navy">
            {published ? "Publié" : setup ? "Brouillon" : "Non configuré"}
          </p>
          <p className="text-sm text-text-muted">
            {published && setup?.publishedAt
              ? `depuis le ${formatDateFr(setup.publishedAt, event.timezone)}`
              : "Statut"}
          </p>
        </div>
      </div>

      {notSummit && (
        <Alert>
          <AlertDescription>
            Les créneaux rendez-vous sont réservés aux événements de type « Summit annuel ». Changez
            le type de l&apos;événement pour en configurer.
          </AlertDescription>
        </Alert>
      )}
      {event.isOnline && (
        <Alert>
          <AlertDescription>
            Cet événement est en ligne : les rendez-vous B2B se tiennent sur place, dans une zone
            dédiée. Passez l&apos;événement en présentiel pour configurer des créneaux.
          </AlertDescription>
        </Alert>
      )}
      {isOver && (
        <Alert>
          <AlertDescription>
            L&apos;événement est terminé : les créneaux sont consultables mais ne sont plus
            modifiables.
          </AlertDescription>
        </Alert>
      )}

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>1. Zone RDV</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingSetupForm
              eventId={event.id}
              initialValues={{
                zone: setup?.zone ?? "",
                accessInstructions: setup?.accessInstructions ?? "",
                slotDurationMinutes: setup?.slotDurationMinutes ?? 30,
              }}
            />
          </CardContent>
        </Card>
      )}

      {setup && editable && (
        <Card>
          <CardHeader>
            <CardTitle>2. Générer les créneaux</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <MeetingGridForm
              eventId={event.id}
              eventDays={days}
              defaultDuration={setup.slotDurationMinutes}
              timeZone={event.timezone}
              published={published}
              draftCount={draftCount}
            />
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-sm font-semibold text-navy">
                Ou ajouter un créneau à la main
              </p>
              <MeetingSlotAddForm eventId={event.id} eventDays={days} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{setup && editable ? "3. Créneaux" : "Créneaux"}</CardTitle>
        </CardHeader>
        <CardContent>
          {slots.length === 0 ? (
            <EmptyState
              title="Aucun créneau"
              description={
                setup
                  ? "Générez la grille ou ajoutez un créneau à la main."
                  : "Enregistrez d'abord la zone RDV."
              }
            />
          ) : (
            <div className="flex flex-col gap-6">
              {[...slotsByDay.entries()].map(([day, daySlots]) => (
                <div key={day}>
                  <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">
                    {formatDayKey(day)} · {daySlots.length} créneau(x)
                  </h2>
                  <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {daySlots.map((slot) => {
                      const badge = SLOT_BADGE[slot.status];
                      const pending = slot.bookings.filter((b) => b.status === "PENDING").length;
                      const confirmed = slot.bookings.filter(
                        (b) => b.status === "CONFIRMED"
                      ).length;
                      return (
                        <div
                          key={slot.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="font-semibold text-navy">
                              {formatTimeRangeInZone(slot.startTime, slot.endTime, event.timezone)}
                            </span>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            <span className="text-xs text-text-muted">
                              {slot._count.participantSlots} disponible(s) · {pending} en attente ·{" "}
                              {confirmed} confirmé(s)
                            </span>
                          </div>
                          <MeetingSlotActions
                            slotId={slot.id}
                            disabled={slot.status === "DISABLED"}
                            canDelete={slot._count.bookings === 0}
                            readOnly={!editable}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
