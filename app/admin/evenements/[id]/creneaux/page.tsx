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
import { cn, formatDateFr } from "@/lib/utils";
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
  DRAFT: { variant: "draft", label: "Pas encore publié" },
  PUBLISHED: { variant: "active", label: "Visible" },
  DISABLED: { variant: "refused", label: "Désactivé" },
} as const;

type StepState = "done" | "current" | "todo";

/** Pastille numérotée d'une étape : ✓ quand elle est faite. */
function StepNumber({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        state === "done" && "bg-emerald-600 text-white",
        state === "current" && "bg-navy text-white",
        state === "todo" && "border border-border bg-white text-text-muted"
      )}
      aria-hidden
    >
      {state === "done" ? "✓" : n}
    </span>
  );
}

function StepTitle({
  n,
  state,
  title,
  hint,
}: {
  n: number;
  state: StepState;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <StepNumber n={n} state={state} />
      <div>
        <CardTitle>
          Étape {n} · {title}
        </CardTitle>
        <p className="mt-1 text-sm font-normal text-text-muted">{hint}</p>
      </div>
    </div>
  );
}

/**
 * Module 21 lot 2 (8 oct. 2026) — créneaux de rendez-vous B2B d'un
 * événement (conception/21 §3.0 étape 4, P1). Option distincte du
 * Programme (agenda multi-salles). Heures dans le fuseau de l'événement.
 * 5 nov. 2026 : page réorganisée en 3 étapes guidées (lieu, horaires,
 * publication) avec leur avancement, pour être comprise sans mode d'emploi.
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

  // Avancement : chaque étape est « faite », « en cours » ou « à venir ».
  const step1: StepState = setup ? "done" : "current";
  const step2: StepState = !setup ? "todo" : slots.length > 0 ? "done" : "current";
  const step3: StepState =
    slots.length === 0 ? "todo" : published && draftCount === 0 ? "done" : "current";

  const statusText = published
    ? `Publié${setup?.publishedAt ? ` depuis le ${formatDateFr(setup.publishedAt, event.timezone)}` : ""} : les participants voient les créneaux et peuvent se demander des rendez-vous.`
    : "Pas encore publié : les participants ne voient encore rien.";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/admin/evenements/${event.id}/editer`} className="text-sm text-text-muted">
          ← {event.title}
        </Link>
        <h1 className="text-xl font-bold text-navy">Créneaux de rendez-vous B2B</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-mid">
          Ici, vous choisissez <strong>où</strong> et <strong>à quelles heures</strong> les
          participants pourront se rencontrer en tête-à-tête pendant l&apos;événement. Une fois
          publiés, les {event._count.registrations} participants inscrits verront ces créneaux et
          pourront se demander des rendez-vous.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Toutes les heures sont en {tzLabel} ·{" "}
          <Link
            href={`/admin/evenements/${event.id}/editer`}
            className="font-semibold text-navy-mid"
          >
            Changer le fuseau horaire →
          </Link>
        </p>
      </div>

      {editable && (
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            { n: 1, state: step1, label: "Indiquer le lieu" },
            { n: 2, state: step2, label: "Choisir les horaires" },
            { n: 3, state: step3, label: "Publier" },
          ].map((s) => (
            <li
              key={s.n}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm",
                s.state === "current" ? "border-navy font-semibold text-navy" : "border-border",
                s.state === "todo" && "text-text-muted"
              )}
            >
              <StepNumber n={s.n} state={s.state} />
              {s.label}
            </li>
          ))}
        </ol>
      )}

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
            <StepTitle
              n={1}
              state={step1}
              title="Où ont lieu les rendez-vous ?"
              hint="L'endroit où les participants se retrouvent sur place."
            />
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

      {editable && (
        <Card className={cn(!setup && "opacity-60")}>
          <CardHeader>
            <StepTitle
              n={2}
              state={step2}
              title="À quelles heures ?"
              hint="Indiquez la plage horaire : les créneaux sont découpés automatiquement."
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {setup ? (
              <>
                <MeetingGridForm
                  eventId={event.id}
                  eventDays={days}
                  defaultDuration={setup.slotDurationMinutes}
                  timeZone={event.timezone}
                  published={published}
                  draftCount={draftCount}
                />
                <details className="border-t border-border pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-navy-mid">
                    Besoin d&apos;un créneau en dehors de ces horaires ? Ajoutez-le à la main
                  </summary>
                  <div className="mt-3">
                    <MeetingSlotAddForm eventId={event.id} eventDays={days} />
                  </div>
                </details>
              </>
            ) : (
              <p className="text-sm text-text-muted">Enregistrez d&apos;abord le lieu (étape 1).</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className={cn(editable && slots.length === 0 && "opacity-60")}>
        <CardHeader>
          {editable ? (
            <StepTitle
              n={3}
              state={step3}
              title="Vérifier et publier"
              hint={
                slots.length === 0
                  ? "Les créneaux créés apparaîtront ici."
                  : "Vérifiez la liste, retirez ce qui ne convient pas, puis publiez."
              }
            />
          ) : (
            <CardTitle>Créneaux</CardTitle>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {slots.length > 0 && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
                published && draftCount === 0
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-gold bg-gold-pale"
              )}
            >
              <p className="text-sm text-text-mid">
                <strong className="text-navy">{slots.length} créneau(x)</strong> sur{" "}
                {slotsByDay.size} jour(s). {statusText}
                {published && draftCount > 0 && (
                  <> {draftCount} nouveau(x) créneau(x) reste(nt) à publier.</>
                )}
              </p>
              {setup && editable && (
                <MeetingPublishButton
                  eventId={event.id}
                  draftCount={draftCount}
                  alreadyPublished={published}
                />
              )}
            </div>
          )}

          {slots.length === 0 ? (
            <EmptyState
              title="Aucun créneau pour l'instant"
              description={
                setup
                  ? "Choisissez les horaires à l'étape 2 puis cliquez sur « Créer ces créneaux »."
                  : "Commencez par indiquer le lieu des rendez-vous (étape 1)."
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
                            {slot.status === "PUBLISHED" && (
                              <span className="text-xs text-text-muted">
                                {slot._count.participantSlots} participant(s) disponible(s) ·{" "}
                                {pending} demande(s) en attente · {confirmed} rendez-vous
                                confirmé(s)
                              </span>
                            )}
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
