"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarPlus, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { acceptMeeting, declineMeeting, withdrawMeeting } from "@/app/actions/meeting-requests";
import {
  MEETING_FILTERS,
  matchesMeetingFilter,
  type MeetingDisplayStatus,
  type MeetingFilter,
} from "@/lib/meeting-booking";
import { ACCEPT_QUICK_REPLIES, DECLINE_QUICK_REPLIES } from "@/lib/meeting-request-ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ResponseMessageField } from "@/components/meetings/response-message-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";

export interface MyMeetingView {
  id: string;
  sent: boolean;
  status: MeetingDisplayStatus;
  reason: string;
  /** Mot du destinataire en répondant. */
  responseMessage: string | null;
  /** « 12 mars 2027, 14h00 – 14h30 » */
  when: string;
  timezoneLabel: string;
  /** Échéance de réponse d'une demande en attente, déjà formatée. */
  expiresLabel: string;
  eventTitle: string;
  zone: string;
  accessInstructions: string;
  partner: {
    id: string;
    name: string;
    title: string | null;
    avatarUrl: string | null;
    companyName: string | null;
    contact: { phone: string | null; email: string } | null;
  };
  googleCalendarUrl: string | null;
}

/** Même code couleur que « Mes créneaux » : en attente orange, confirmé bleu marine. */
const STATUS: Record<MeetingDisplayStatus, { label: string; badge: string }> = {
  PENDING: { label: "En attente", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  CONFIRMED: { label: "Confirmé", badge: "bg-navy-light text-navy ring-navy/30" },
  COMPLETED: { label: "Terminé", badge: "bg-slate-100 text-slate-600 ring-slate-200" },
  DECLINED: { label: "Refusé", badge: "bg-red-50 text-red-700 ring-red-200" },
  EXPIRED: { label: "Expiré", badge: "bg-slate-50 text-slate-500 ring-slate-200" },
  WITHDRAWN: { label: "Retiré", badge: "bg-slate-50 text-slate-500 ring-slate-200" },
  CANCELLED: { label: "Annulé", badge: "bg-slate-50 text-slate-500 ring-slate-200" },
};

type Confirming = { id: string; name: string } | null;
type Responding = { id: string; kind: "accept" | "decline"; name: string } | null;

/**
 * Module 21 lots 5 et 8 (3 nov. 2026) — onglet « Mes rendez-vous »
 * (conception/21 P5) : demandes reçues et envoyées, filtres (« À venir » par
 * défaut, D16), accepter ou refuser une demande reçue, retirer une demande
 * envoyée. Téléphone et e-mail de l'autre participant après confirmation
 * (RG-04), avec la zone et les indications d'accès.
 */
export function MyMeetings({ meetings }: { meetings: MyMeetingView[] }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<MeetingFilter>("upcoming");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<Confirming>(null);
  const [responding, setResponding] = React.useState<Responding>(null);
  const [message, setMessage] = React.useState("");

  const visible = meetings.filter((m) => matchesMeetingFilter(m.status, filter));
  const countOf = (f: MeetingFilter) =>
    meetings.filter((m) => matchesMeetingFilter(m.status, f)).length;

  async function run(
    id: string,
    action: (id: string) => Promise<{ success: boolean; error?: string }>
  ) {
    setError(null);
    setBusy(id);
    try {
      const result = await action(id);
      if (!result.success) setError(result.error ?? "Action impossible.");
      // Rafraîchit aussi après un échec : la demande a pu expirer ou changer.
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les rendez-vous">
        {MEETING_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              filter === f.value
                ? "border-navy bg-navy text-white"
                : "border-border bg-white text-text-mid hover:border-navy/40"
            )}
          >
            {f.label} <span className="opacity-70">({countOf(f.value)})</span>
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-border bg-white p-6 text-sm text-text-mid">
          Aucun rendez-vous dans cette catégorie.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map((m) => {
            const status = STATUS[m.status];
            const received = !m.sent;
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                    <CalendarClock className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                    {m.when}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                      status.badge
                    )}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={m.partner.avatarUrl ?? undefined} alt={m.partner.name} />
                    <AvatarFallback>{initials(m.partner.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs text-text-muted">
                      {m.sent ? "Demande envoyée à" : "Demande reçue de"}
                    </p>
                    <Link
                      href={`/membres/${m.partner.id}`}
                      className="font-semibold text-navy hover:underline"
                    >
                      {m.partner.name}
                    </Link>
                    <p className="truncate text-xs text-text-muted">
                      {[m.partner.title, m.partner.companyName].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <p className="rounded-md bg-surface-2 p-3 text-sm leading-relaxed text-text">
                  {m.reason}
                </p>

                {m.responseMessage && (
                  <div className="rounded-md border border-navy/20 bg-navy-light/40 p-3 text-sm">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy">
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      {m.sent ? `Message de ${m.partner.name}` : "Votre message"}
                    </p>
                    <p className="leading-relaxed text-text">{m.responseMessage}</p>
                    {m.sent && (
                      <Link
                        href={`/messagerie?new=${m.partner.id}`}
                        className="mt-2 inline-block text-xs font-semibold text-navy-mid underline"
                      >
                        Lui répondre
                      </Link>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-1 text-xs text-text-mid">
                  <p>
                    {m.eventTitle} · Horaires en {m.timezoneLabel}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      {m.zone}
                      {m.accessInstructions && ` — ${m.accessInstructions}`}
                    </span>
                  </p>
                  {m.status === "PENDING" && (
                    <p className="text-amber-700">Réponse attendue avant le {m.expiresLabel}.</p>
                  )}
                </div>

                {m.partner.contact && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
                    {m.partner.contact.phone && (
                      <a
                        href={`tel:${m.partner.contact.phone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-1.5 font-medium text-navy-mid"
                      >
                        <Phone className="h-4 w-4" aria-hidden /> {m.partner.contact.phone}
                      </a>
                    )}
                    <a
                      href={`mailto:${m.partner.contact.email}`}
                      className="inline-flex min-w-0 items-center gap-1.5 font-medium text-navy-mid"
                    >
                      <Mail className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{m.partner.contact.email}</span>
                    </a>
                  </div>
                )}

                {m.googleCalendarUrl && (
                  <div className="flex flex-wrap gap-2">
                    {/* Fichier .ics : feuille « Ajouter à l'agenda » sur iPhone, Google Agenda sur Android. */}
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/rendez-vous/${m.id}/ics`}>
                        <CalendarPlus className="h-4 w-4" aria-hidden /> Ajouter à mon agenda
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={m.googleCalendarUrl} target="_blank" rel="noreferrer">
                        Google Agenda
                      </a>
                    </Button>
                  </div>
                )}

                {m.status === "PENDING" && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                    {received ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => {
                            setMessage("");
                            setResponding({ id: m.id, kind: "decline", name: m.partner.name });
                          }}
                        >
                          Refuser
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => {
                            setMessage("");
                            setResponding({ id: m.id, kind: "accept", name: m.partner.name });
                          }}
                        >
                          Accepter
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => setConfirming({ id: m.id, name: m.partner.name })}
                      >
                        Retirer la demande
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Retirer la demande"
        description={`Votre demande à ${confirming?.name ?? ""} sera retirée et le créneau redeviendra libre.`}
        confirmLabel="Retirer"
        variant="destructive"
        onConfirm={async () => {
          if (!confirming) return;
          const { id } = confirming;
          setConfirming(null);
          await run(id, withdrawMeeting);
        }}
      />

      <Dialog open={responding !== null} onOpenChange={(open) => !open && setResponding(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {responding?.kind === "accept"
                ? `Accepter le rendez-vous avec ${responding.name}`
                : `Refuser la demande de ${responding?.name ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {responding?.kind === "accept"
                ? `Laissez un mot à ${responding.name} (facultatif) : où vous retrouver, comment vous reconnaître…`
                : "Vous pouvez expliquer pourquoi (facultatif). Le créneau redeviendra libre."}
            </DialogDescription>
          </DialogHeader>
          {responding && (
            <ResponseMessageField
              id="meeting-response-message"
              replies={responding.kind === "accept" ? ACCEPT_QUICK_REPLIES : DECLINE_QUICK_REPLIES}
              value={message}
              onChange={setMessage}
              disabled={busy !== null}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResponding(null)} disabled={busy !== null}>
              Annuler
            </Button>
            <Button
              variant={responding?.kind === "decline" ? "destructive" : "default"}
              disabled={busy !== null}
              onClick={async () => {
                if (!responding) return;
                const { id, kind } = responding;
                await run(id, (i) =>
                  kind === "accept" ? acceptMeeting(i, message) : declineMeeting(i, message)
                );
                setResponding(null);
              }}
            >
              {busy !== null
                ? "Envoi…"
                : responding?.kind === "accept"
                  ? "Confirmer le rendez-vous"
                  : "Refuser la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
