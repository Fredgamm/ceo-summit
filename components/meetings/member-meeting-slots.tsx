"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { requestMeeting } from "@/app/actions/meeting-requests";
import { MEETING_REASON_MAX, MEETING_REASON_MIN } from "@/lib/meeting-booking";
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

type State = "available" | "taken" | "you-unavailable" | "past";

export interface MemberSlotView {
  id: string;
  range: string;
  state: State;
}

/** Même code couleur que « Mes créneaux » : libre vert, pris orange, indisponible gris. */
const STATE: Record<State, { label: string; dot: string; badge: string }> = {
  available: {
    label: "Libre",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  taken: {
    label: "Déjà pris",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  "you-unavailable": {
    label: "Vous êtes indisponible",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  past: { label: "Passé", dot: "bg-slate-300", badge: "bg-slate-50 text-slate-400 ring-slate-200" },
};

/**
 * Module 21 lot 4 (8 oct. 2026) — onglet « Rendez-vous événement » du profil
 * d'un autre participant (conception/21 P2) : ses créneaux libres sont
 * cliquables, ceux en attente ou réservés sont visibles mais grisés.
 */
export function MemberMeetingSlots({
  memberId,
  memberName,
  eventTitle,
  zone,
  timezoneLabel,
  days,
  memberUnavailable,
  existingBooking,
}: {
  memberId: string;
  memberName: string;
  eventTitle: string;
  zone: string;
  timezoneLabel: string;
  days: { label: string; slots: MemberSlotView[] }[];
  memberUnavailable: boolean;
  existingBooking: { status: "PENDING" | "CONFIRMED"; label: string } | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<string | null>(null);

  const blocked = memberUnavailable || existingBooking !== null;
  const hasFree = days.some((d) => d.slots.some((s) => s.state === "available"));
  const reasonLength = reason.trim().length;

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
      setSent(selected.label);
      setSelected(null);
      setReason("");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <h2 className="text-base font-bold text-navy">Rendez-vous B2B — {eventTitle}</h2>
      <p className="mb-4 text-sm text-text-mid">
        📍 {zone} · Horaires en {timezoneLabel}
      </p>

      {sent && (
        <Alert className="mb-4">
          <AlertDescription>
            Demande envoyée à {memberName} pour le créneau {sent}. Vous serez prévenu de sa réponse
            ; suivez-la dans « Mes créneaux ».
          </AlertDescription>
        </Alert>
      )}
      {memberUnavailable && (
        <Alert className="mb-4">
          <AlertDescription>
            {memberName} ne peut pas encore recevoir de demande de rendez-vous.
          </AlertDescription>
        </Alert>
      )}
      {existingBooking && (
        <Alert className="mb-4">
          <AlertDescription>
            {existingBooking.status === "PENDING"
              ? `Une demande est déjà en cours avec ${memberName} (${existingBooking.label}).`
              : `Vous avez déjà rendez-vous avec ${memberName} (${existingBooking.label}).`}{" "}
            Une seule demande ou un seul rendez-vous est possible entre deux participants.
          </AlertDescription>
        </Alert>
      )}
      {!blocked && !hasFree && (
        <p className="mb-4 text-sm text-text-mid">
          {memberName} n&apos;a plus de créneau libre pour le moment.
        </p>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-text-mid">Aucun créneau disponible.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <div key={day.label}>
              <p className="mb-2 text-xs font-bold uppercase text-gold">{day.label}</p>
              <ul className="divide-y divide-border rounded-md border border-border">
                {day.slots.map((slot) => {
                  const state = STATE[slot.state];
                  const canAsk = slot.state === "available" && !blocked;
                  return (
                    <li
                      key={slot.id}
                      className={cn(
                        "grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5",
                        slot.state !== "available" && "opacity-70"
                      )}
                    >
                      <span className="text-sm font-semibold text-navy">{slot.range}</span>
                      <span
                        className={cn(
                          "inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                          state.badge
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", state.dot)} />
                        {state.label}
                      </span>
                      <Button
                        size="sm"
                        variant={canAsk ? "default" : "ghost"}
                        disabled={!canAsk}
                        onClick={() => {
                          setError(null);
                          setSelected({ id: slot.id, label: `${day.label}, ${slot.range}` });
                        }}
                      >
                        Demander
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander un rendez-vous à {memberName}</DialogTitle>
            <DialogDescription>
              {selected?.label} ({timezoneLabel}) · {zone}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-reason">Motif de la rencontre *</Label>
            <Textarea
              id="meeting-reason"
              rows={4}
              maxLength={MEETING_REASON_MAX}
              placeholder="ex. Présenter notre offre logistique et explorer un partenariat dans l'océan Indien."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-right text-xs text-text-muted">
              {reasonLength}/{MEETING_REASON_MAX} (minimum {MEETING_REASON_MIN})
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Le créneau est réservé pour vous deux jusqu&apos;à la réponse. Le téléphone de{" "}
            {memberName} vous sera communiqué si la demande est acceptée.{" "}
            <Link href="/profil?onglet=creneaux" className="underline">
              Mes créneaux
            </Link>
          </p>
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
