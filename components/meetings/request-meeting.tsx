"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { requestMeeting } from "@/app/actions/meeting-requests";
import { MEETING_REASON_MAX, MEETING_REASON_MIN } from "@/lib/meeting-booking";
import { defaultDay, slotPeriod, visitorSlotLabel } from "@/lib/meeting-request-ui";
import type { VisitorSlotState } from "@/lib/meeting-participation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface RequestSlotView {
  id: string;
  /** « 09h30 – 10h00 », dans le fuseau de l'événement. */
  range: string;
  state: VisitorSlotState;
}

export interface RequestDayView {
  key: string;
  /** « 11 janvier 2027 » */
  label: string;
  slots: RequestSlotView[];
}

const PERIODS = [
  { value: "morning", label: "Matin" },
  { value: "afternoon", label: "Après-midi" },
] as const;

/**
 * Module 21 (3 nov. 2026) — page « Demander un rendez-vous » d'un membre :
 * un jour à la fois, créneaux en grille compacte (matin / après-midi). Un
 * créneau libre se choisit d'un appui ; les autres sont grisés avec un seul
 * mot (« Réservé », « Inactif », « Occupé », « Passé »). Le motif se saisit
 * dans une fenêtre, puis la page confirme l'envoi.
 */
export function RequestMeeting({
  memberId,
  memberName,
  timezoneLabel,
  zone,
  days,
}: {
  memberId: string;
  memberName: string;
  timezoneLabel: string;
  zone: string;
  days: RequestDayView[];
}) {
  const router = useRouter();
  const [dayKey, setDayKey] = React.useState<string | null>(() => defaultDay(days));
  const [selected, setSelected] = React.useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentLabel, setSentLabel] = React.useState<string | null>(null);

  const day = days.find((d) => d.key === dayKey) ?? days[0];
  const reasonLength = reason.trim().length;

  async function submit() {
    if (!selected) return;
    setError(null);
    setSending(true);
    try {
      const result = await requestMeeting({ slotId: selected.id, recipientId: memberId, reason });
      if (!result.success) {
        setError(result.error);
        // Le créneau a pu être pris entre-temps : on rafraîchit la grille.
        router.refresh();
        return;
      }
      // Pas de rechargement ici : la page, voyant la demande qui vient d'être créée,
      // remplacerait aussitôt ce message de succès par « vous avez déjà une demande ».
      setSentLabel(selected.label);
      setSelected(null);
      setReason("");
    } finally {
      setSending(false);
    }
  }

  if (sentLabel) {
    return (
      <div className="rounded-lg border border-border bg-white p-6">
        <Alert variant="success">
          <CheckCircle2 />
          <AlertDescription>
            Demande envoyée à {memberName} pour le {sentLabel}. Vous serez prévenu de sa réponse par
            email.
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="justify-center">
            <Link href="/profil?onglet=mes-rendez-vous">Voir mes rendez-vous</Link>
          </Button>
          <Button asChild variant="outline" className="justify-center">
            <Link href={`/membres/${memberId}`}>Retour au profil</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4 sm:p-6">
      {days.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choisir un jour">
            {days.map((d) => {
              const free = d.slots.filter((s) => s.state === "available").length;
              return (
                <button
                  key={d.key}
                  type="button"
                  role="tab"
                  aria-selected={day?.key === d.key}
                  onClick={() => setDayKey(d.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    day?.key === d.key
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-white text-text-mid hover:border-navy/40"
                  )}
                >
                  {d.label}
                  <span className="ml-1.5 opacity-70">({free})</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-muted">Horaires en {timezoneLabel}</p>
        </div>
      )}

      {!day || day.slots.length === 0 ? (
        <p className="text-sm text-text-mid">Aucun créneau pour ce jour.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {PERIODS.map((period) => {
            const slots = day.slots.filter((s) => slotPeriod(s.range) === period.value);
            if (slots.length === 0) return null;
            return (
              <section key={period.value}>
                <h2 className="mb-2 text-xs font-bold uppercase text-gold">{period.label}</h2>
                <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {slots.map((slot) => {
                    const label = visitorSlotLabel(slot.state);
                    return (
                      <li key={slot.id}>
                        {label === null ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setSelected({ id: slot.id, label: `${day.label}, ${slot.range}` });
                            }}
                            className="flex h-10 w-full items-center justify-center rounded-lg border border-navy/30 bg-white px-2 text-sm font-semibold text-navy transition-colors hover:border-navy hover:bg-navy hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
                          >
                            {slot.range}
                          </button>
                        ) : (
                          <div
                            aria-disabled="true"
                            className="flex h-10 w-full cursor-not-allowed select-none items-center justify-between gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 text-xs text-slate-500"
                          >
                            <span className="whitespace-nowrap font-semibold">{slot.range}</span>
                            <span className="font-medium">{label}</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl sm:p-8">
          <DialogHeader>
            <DialogTitle>Demander un rendez-vous à {memberName}</DialogTitle>
            <DialogDescription>
              {selected?.label} ({timezoneLabel}){zone ? ` · ${zone}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-reason">Motif de la rencontre *</Label>
            <Textarea
              id="meeting-reason"
              rows={7}
              maxLength={MEETING_REASON_MAX}
              placeholder="ex. Présenter notre offre logistique et explorer un partenariat dans l'océan Indien."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-right text-xs text-text-muted">
              {reasonLength}/{MEETING_REASON_MAX} (minimum {MEETING_REASON_MIN})
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={sending}>
              Annuler
            </Button>
            <Button
              onClick={submit}
              disabled={
                sending || reasonLength < MEETING_REASON_MIN || reasonLength > MEETING_REASON_MAX
              }
            >
              {sending ? "Envoi…" : "Envoyer la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
