"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { setAllMeetingSlots, toggleMeetingSlot } from "@/app/actions/meetings";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  counts: { total: number; active: number; inactive: number; pending: number; booked: number };
}

/**
 * Code couleur des statuts (conception/21 §3.2, doc client §4.5) : libre en
 * vert, en attente en orange, réservé en bleu marine, inactif en gris ; un
 * créneau passé est grisé. Créneaux en grille, une colonne sur mobile.
 */
const STATUS: Record<
  Status | "PAST",
  { label: string; badge: string; card: string; count: string }
> = {
  FREE: {
    label: "Libre",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    card: "border-l-emerald-500",
    count: "text-emerald-700",
  },
  PENDING: {
    label: "En attente",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    card: "border-l-amber-500",
    count: "text-amber-700",
  },
  BOOKED: {
    label: "Réservé",
    badge: "bg-navy-light text-navy ring-navy/30",
    card: "border-l-navy",
    count: "text-navy",
  },
  INACTIVE: {
    label: "Inactif",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    card: "border-l-slate-300",
    count: "text-slate-500",
  },
  PAST: {
    label: "Passé",
    badge: "bg-slate-50 text-slate-400 ring-slate-200",
    card: "border-l-slate-200",
    count: "text-slate-400",
  },
};

/** Interrupteur actif / inactif. */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-emerald-500" : "bg-slate-300"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/**
 * Module 21 lot 3 (8 oct. 2026) — onglet « Mes créneaux » (conception/21
 * P4). Les créneaux publiés sont actifs par défaut (D3 révisée) : le
 * participant désactive ceux où il n'est pas disponible. Un créneau en
 * attente, réservé ou passé ne se modifie pas (RG-13).
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
            Votre profil est incomplet ({missingProfileFields.join(", ")}) : les autres participants
            ne pourront pas vous demander de rendez-vous tant qu&apos;il ne l&apos;est pas.{" "}
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

          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Créneaux", value: event.counts.total, color: "text-navy" },
              { label: "Libres", value: event.counts.active, color: STATUS.FREE.count },
              { label: "En attente", value: event.counts.pending, color: STATUS.PENDING.count },
              { label: "Réservés", value: event.counts.booked, color: STATUS.BOOKED.count },
              { label: "Inactifs", value: event.counts.inactive, color: STATUS.INACTIVE.count },
            ].map((c) => (
              <div key={c.label} className="rounded-md bg-surface-2 p-3">
                <p className={cn("text-xl font-bold", c.color)}>{c.value}</p>
                <p className="text-xs text-text-muted">{c.label}</p>
              </div>
            ))}
          </div>
          <p className="mb-4 text-sm text-text-mid">
            Vos créneaux sont actifs par défaut : désactivez ceux où vous n&apos;êtes pas
            disponible. Les autres participants peuvent vous demander un rendez-vous sur les
            créneaux libres.
          </p>

          <div className="flex flex-col gap-4">
            {event.days.map((day) => (
              <div key={day.label}>
                <p className="mb-2 text-xs font-bold uppercase text-gold">{day.label}</p>
                <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {day.slots.map((slot) => {
                    const status = slot.started ? STATUS.PAST : STATUS[slot.status];
                    const locked =
                      slot.started || slot.status === "PENDING" || slot.status === "BOOKED";
                    const on = slot.status !== "INACTIVE";
                    return (
                      <li
                        key={slot.id}
                        className={cn(
                          "flex flex-col gap-2 rounded-md border border-l-4 border-border bg-white px-3 py-2.5",
                          status.card,
                          slot.started && "opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-navy">{slot.range}</span>
                          <Toggle
                            checked={on}
                            disabled={locked || busy !== null}
                            label={`${slot.range} : ${on ? "désactiver" : "activer"}`}
                            onChange={() => run(slot.id, () => toggleMeetingSlot(slot.id, !on))}
                          />
                        </div>
                        <span
                          className={cn(
                            "w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                            status.badge
                          )}
                        >
                          {status.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
