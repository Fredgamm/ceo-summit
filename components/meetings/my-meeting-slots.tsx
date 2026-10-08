"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { setAllMeetingSlots, toggleMeetingSlot } from "@/app/actions/meetings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "INACTIVE" | "FREE" | "PENDING" | "BOOKED";

export interface MySlotView {
  id: string;
  range: string;
  status: Status;
  started: boolean;
}

export interface MyMeetingEventView {
  id: string;
  title: string;
  timezoneLabel: string;
  zone: string;
  accessInstructions: string;
  days: { label: string; slots: MySlotView[] }[];
  counts: { total: number; active: number; pending: number; booked: number };
}

const STATUS: Record<
  Status,
  { label: string; variant: "draft" | "active" | "pending" | "chairman" }
> = {
  INACTIVE: { label: "Inactif", variant: "draft" },
  FREE: { label: "Disponible", variant: "active" },
  PENDING: { label: "Demande en attente", variant: "pending" },
  BOOKED: { label: "Rendez-vous confirmé", variant: "chairman" },
};

/**
 * Module 21 lot 3 (8 oct. 2026) — onglet « Mes créneaux » (conception/21
 * P4). Les créneaux publiés sont inactifs tant que le participant ne les
 * active pas (D3). Un créneau en attente ou réservé ne se désactive pas
 * (RG-13).
 */
export function MyMeetingSlots({
  events,
  missingProfileFields,
}: {
  events: MyMeetingEventView[];
  missingProfileFields: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(key: string, action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    setBusy(key);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Action impossible.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {missingProfileFields.length > 0 && (
        <Alert>
          <AlertDescription>
            Pour activer des créneaux, complétez votre profil : {missingProfileFields.join(", ")}.{" "}
            <Link href="/profil/editer" className="font-semibold underline">
              Compléter mon profil
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {events.map((event) => (
        <div key={event.id} className="rounded-lg border border-border bg-white p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-navy">Rendez-vous B2B — {event.title}</h2>
              <p className="text-sm text-text-mid">
                📍 {event.zone} · Horaires en {event.timezoneLabel}
              </p>
              <p className="mt-1 text-xs text-text-muted">{event.accessInstructions}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => run(`all-on-${event.id}`, () => setAllMeetingSlots(event.id, true))}
              >
                Tout activer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  run(`all-off-${event.id}`, () => setAllMeetingSlots(event.id, false))
                }
              >
                Tout désactiver
              </Button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Créneaux", value: event.counts.total },
              { label: "Disponibles", value: event.counts.active },
              { label: "En attente", value: event.counts.pending },
              { label: "Confirmés", value: event.counts.booked },
            ].map((c) => (
              <div key={c.label} className="rounded-md bg-surface-2 p-3">
                <p className="text-xl font-bold text-navy">{c.value}</p>
                <p className="text-xs text-text-muted">{c.label}</p>
              </div>
            ))}
          </div>

          {event.counts.active + event.counts.pending + event.counts.booked === 0 && (
            <p className="mb-4 text-sm text-text-mid">
              Activez les créneaux où vous êtes disponible : les autres participants pourront alors
              vous demander un rendez-vous sur ces horaires.
            </p>
          )}

          <div className="flex flex-col gap-4">
            {event.days.map((day) => (
              <div key={day.label}>
                <p className="mb-2 text-xs font-bold uppercase text-gold">{day.label}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {day.slots.map((slot) => {
                    const status = STATUS[slot.status];
                    const locked = slot.status === "PENDING" || slot.status === "BOOKED";
                    const on = slot.status !== "INACTIVE";
                    return (
                      <div
                        key={slot.id}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md border px-3 py-2",
                          on ? "border-emerald-200 bg-emerald-50/50" : "border-border",
                          slot.started && "opacity-50"
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-navy">{slot.range}</span>
                          <Badge variant={status.variant} className="w-fit">
                            {slot.started ? "Passé" : status.label}
                          </Badge>
                        </div>
                        {!slot.started && !locked && (
                          <Button
                            size="sm"
                            variant={on ? "ghost" : "outline"}
                            disabled={busy !== null}
                            onClick={() => run(slot.id, () => toggleMeetingSlot(slot.id, !on))}
                          >
                            {busy === slot.id ? "…" : on ? "Désactiver" : "Activer"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
