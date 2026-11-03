"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Sun, Sunset } from "lucide-react";

import { requestMeeting } from "@/app/actions/meeting-requests";
import {
  MEETING_REASON_MAX,
  MEETING_REASON_MIN,
  MEETING_REQUEST_TTL_HOURS,
} from "@/lib/meeting-booking";
import {
  QUICK_REASONS,
  applyQuickReason,
  dayParts,
  defaultDay,
  freeLabel,
  reasonHint,
  slotPeriod,
  visitorSlotLabel,
} from "@/lib/meeting-request-ui";
import type { VisitorSlotState } from "@/lib/meeting-participation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface RequestSlotView {
  id: string;
  /** « 09h30 – 10h00 », dans le fuseau de l'événement. */
  range: string;
  state: VisitorSlotState;
}

export interface RequestDayView {
  key: string;
  slots: RequestSlotView[];
}

const PERIODS = [
  { value: "morning", label: "Matin", Icon: Sun },
  { value: "afternoon", label: "Après-midi", Icon: Sunset },
] as const;

/** Titre d'une étape, avec sa pastille numérotée. */
function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 text-base font-bold text-navy">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
        {n}
      </span>
      {children}
    </h2>
  );
}

/**
 * Module 21 (3 nov. 2026) — page « Prendre rendez-vous », pensée pour être
 * comprise sans lire : trois étapes numérotées (quel jour, quelle heure,
 * pourquoi), de grandes zones à toucher, un seul mot sur les créneaux
 * indisponibles, et des motifs prêts à choisir pour éviter de taper sur un
 * téléphone. L'étape 3 apparaît dès qu'une heure est choisie.
 */
export function RequestMeeting({
  memberId,
  memberName,
  timezoneLabel,
  days,
}: {
  memberId: string;
  memberName: string;
  timezoneLabel: string;
  days: RequestDayView[];
}) {
  const [dayKey, setDayKey] = React.useState<string | null>(() => defaultDay(days));
  const [selected, setSelected] = React.useState<{ id: string; range: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentLabel, setSentLabel] = React.useState<string | null>(null);
  const reasonStep = React.useRef<HTMLElement | null>(null);

  const day = days.find((d) => d.key === dayKey) ?? days[0];
  const dayLabel = day ? `${dayParts(day.key).weekday} ${dayParts(day.key).date}` : "";
  const reasonLength = reason.trim().length;
  const hint = reasonHint(reasonLength, MEETING_REASON_MIN);
  const manyDays = days.length > 1;
  const timeStep = manyDays ? 2 : 1;

  // L'étape « pourquoi » apparaît : on l'amène à l'écran (sans animation si la
  // personne a demandé de réduire les mouvements).
  React.useEffect(() => {
    if (!selected) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reasonStep.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [selected]);

  async function submit() {
    if (!selected) return;
    setError(null);
    setSending(true);
    try {
      const result = await requestMeeting({ slotId: selected.id, recipientId: memberId, reason });
      if (!result.success) {
        setError(result.error);
        return;
      }
      // Pas de rechargement ici : la page, voyant la demande qui vient d'être créée,
      // remplacerait aussitôt ce message de succès par « vous avez déjà une demande ».
      setSentLabel(`${dayLabel}, ${selected.range}`);
    } finally {
      setSending(false);
    }
  }

  if (sentLabel) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-8">
        <CheckCircle2 className="h-14 w-14 text-emerald-600" aria-hidden />
        <div>
          <h2 className="text-xl font-bold text-emerald-900">C&apos;est envoyé !</h2>
          <p className="mt-2 text-sm text-emerald-900">
            {memberName} reçoit votre demande pour le <strong>{sentLabel}</strong>. Nous vous
            prévenons par email dès que la réponse arrive.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="justify-center">
            <Link href="/profil?onglet=mes-rendez-vous">Voir mes rendez-vous</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="justify-center bg-white">
            <Link href={`/membres/${memberId}`}>Retour au profil</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {manyDays && (
        <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
          <StepTitle n={1}>Quel jour ?</StepTitle>
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
            role="radiogroup"
            aria-label="Choisir un jour"
          >
            {days.map((d) => {
              const free = d.slots.filter((s) => s.state === "available").length;
              const active = day?.key === d.key;
              const parts = dayParts(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setDayKey(d.key);
                    setSelected(null);
                  }}
                  className={cn(
                    "flex min-h-[4.25rem] flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-white text-navy hover:border-navy/50"
                  )}
                >
                  <span className="text-xs font-semibold capitalize opacity-80">
                    {parts.weekday}
                  </span>
                  <span className="text-base font-bold">{parts.date}</span>
                  <span className={cn("text-xs", active ? "text-white/80" : "text-text-muted")}>
                    {freeLabel(free)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
        <StepTitle n={timeStep}>Quelle heure ?</StepTitle>
        {!day || day.slots.length === 0 ? (
          <p className="text-sm text-text-mid">Aucun créneau ce jour-là.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {PERIODS.map(({ value, label, Icon }) => {
              const slots = day.slots.filter((s) => slotPeriod(s.range) === value);
              if (slots.length === 0) return null;
              return (
                <div key={value}>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-mid">
                    <Icon className="h-4 w-4 text-gold" aria-hidden /> {label}
                  </h3>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {slots.map((slot) => {
                      const state = visitorSlotLabel(slot.state);
                      const active = selected?.id === slot.id;
                      return (
                        <li key={slot.id}>
                          {state === null ? (
                            <button
                              type="button"
                              aria-pressed={active}
                              onClick={() => {
                                setError(null);
                                setSelected({ id: slot.id, range: slot.range });
                              }}
                              className={cn(
                                "flex h-12 w-full items-center justify-center whitespace-nowrap rounded-xl border-2 px-2 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
                                active
                                  ? "border-navy bg-navy text-white"
                                  : "border-navy/30 bg-white text-navy hover:border-navy"
                              )}
                            >
                              {slot.range}
                            </button>
                          ) : (
                            <div
                              aria-disabled="true"
                              className="flex h-12 w-full cursor-not-allowed select-none flex-col items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 px-1 leading-tight text-slate-600"
                            >
                              <span className="whitespace-nowrap text-sm font-medium line-through decoration-slate-400">
                                {slot.range}
                              </span>
                              <span className="text-xs font-semibold">{state}</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            <p className="text-xs text-text-muted">
              Horaires en {timezoneLabel}. Les créneaux grisés ne sont pas disponibles.
            </p>
          </div>
        )}
      </section>

      {selected && (
        <section
          ref={reasonStep}
          className="rounded-2xl border-2 border-navy/25 bg-navy-light/40 p-4 sm:p-5"
        >
          <StepTitle n={timeStep + 1}>Pourquoi ce rendez-vous ?</StepTitle>

          <p className="mb-3 text-sm text-text">
            Vous avez choisi :{" "}
            <strong className="text-navy">
              {dayLabel}, {selected.range}
            </strong>
          </p>

          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Motifs proposés">
            {QUICK_REASONS.map((r) => {
              const on = reason.trim() === r.text;
              return (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setReason((current) => applyQuickReason(current, r.text, MEETING_REASON_MAX))
                  }
                  className={cn(
                    "rounded-full border-2 px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
                    on
                      ? "border-navy bg-navy text-white"
                      : "border-navy/30 bg-white text-navy hover:border-navy"
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <label htmlFor="meeting-reason" className="sr-only">
            Votre message
          </label>
          <Textarea
            id="meeting-reason"
            rows={4}
            maxLength={MEETING_REASON_MAX}
            placeholder="Ou écrivez votre propre message…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-white"
          />
          <p className="mt-1 min-h-[1.25rem] text-xs text-text-muted" aria-live="polite">
            {hint}
          </p>

          {error && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            size="lg"
            className="mt-3 h-12 w-full justify-center text-base"
            onClick={submit}
            disabled={sending || hint !== null}
          >
            {sending ? "Envoi…" : "Envoyer ma demande"}
          </Button>
          <p className="mt-3 text-center text-xs text-text-muted">
            Nous gardons ce créneau pour vous. {memberName} a {MEETING_REQUEST_TTL_HOURS} h au plus
            pour répondre (moins si le créneau est proche), et nous vous prévenons par email.
          </p>
        </section>
      )}
    </div>
  );
}
