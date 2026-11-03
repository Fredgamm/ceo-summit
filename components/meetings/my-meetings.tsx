"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";

import { acceptMeeting, declineMeeting, withdrawMeeting } from "@/app/actions/meeting-requests";
import {
  MEETING_FILTERS,
  matchesMeetingFilter,
  visibleMeetingFilters,
  type MeetingDisplayStatus,
  type MeetingFilter,
} from "@/lib/meeting-booking";
import { ACCEPT_QUICK_REPLIES, DECLINE_QUICK_REPLIES, dayTile } from "@/lib/meeting-request-ui";
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
  /** Jour du rendez-vous dans le fuseau de l'événement : « 2027-03-12 ». */
  dayKey: string;
  /** « 14h00 – 14h30 » */
  timeRange: string;
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
const STATUS: Record<MeetingDisplayStatus, { label: string; badge: string; accent: string }> = {
  PENDING: {
    label: "En attente",
    badge: "bg-amber-100 text-amber-800 ring-amber-300",
    accent: "border-l-amber-500",
  },
  CONFIRMED: {
    label: "Confirmé",
    badge: "bg-navy text-white ring-navy",
    accent: "border-l-navy",
  },
  COMPLETED: {
    label: "Terminé",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    accent: "border-l-slate-300",
  },
  DECLINED: {
    label: "Refusé",
    badge: "bg-red-50 text-red-700 ring-red-200",
    accent: "border-l-red-400",
  },
  EXPIRED: {
    label: "Expiré",
    badge: "bg-slate-50 text-slate-500 ring-slate-200",
    accent: "border-l-slate-300",
  },
  WITHDRAWN: {
    label: "Retiré",
    badge: "bg-slate-50 text-slate-500 ring-slate-200",
    accent: "border-l-slate-300",
  },
  CANCELLED: {
    label: "Annulé",
    badge: "bg-slate-50 text-slate-500 ring-slate-200",
    accent: "border-l-slate-300",
  },
};

/** Ligne de contact : toute la ligne se touche, la valeur est lisible. */
const CONTACT_ROW =
  "flex min-h-11 items-center gap-3 px-3 py-2 text-sm font-medium text-navy hover:bg-surface-2";

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
  const counts = Object.fromEntries(
    MEETING_FILTERS.map((f) => [
      f.value,
      meetings.filter((m) => matchesMeetingFilter(m.status, f.value)).length,
    ])
  ) as Record<MeetingFilter, number>;

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
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer les rendez-vous">
        {visibleMeetingFilters(counts, filter).map((value) => {
          const f = MEETING_FILTERS.find((x) => x.value === value)!;
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                filter === f.value
                  ? "border-navy bg-navy text-white shadow-sm"
                  : "border-border bg-white text-text-mid hover:border-navy/40"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-bold leading-4",
                  filter === f.value ? "bg-white/20 text-white" : "bg-surface-2 text-text-mid"
                )}
              >
                {counts[f.value]}
              </span>
            </button>
          );
        })}
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
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((m) => {
            const status = STATUS[m.status];
            const received = !m.sent;
            const tile = dayTile(m.dayKey);
            const inactive = ["EXPIRED", "WITHDRAWN", "CANCELLED", "DECLINED"].includes(m.status);
            return (
              <li
                key={m.id}
                className={cn(
                  "flex flex-col overflow-hidden rounded-xl border border-l-4 border-border bg-white shadow-sm",
                  status.accent,
                  inactive && "opacity-80"
                )}
              >
                {/* Quand ? Tuile de date, heure en grand, statut. */}
                <div
                  className={cn(
                    "flex items-center gap-3 p-4",
                    m.status === "PENDING" ? "bg-amber-50" : "bg-surface-2"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg text-white",
                      inactive ? "bg-slate-400" : "bg-navy"
                    )}
                    aria-hidden
                  >
                    <span className="text-[11px] font-semibold uppercase leading-none tracking-wide opacity-80">
                      {tile.weekday}
                    </span>
                    <span className="my-0.5 text-2xl font-bold leading-none">{tile.day}</span>
                    <span className="text-[11px] font-semibold uppercase leading-none tracking-wide opacity-80">
                      {tile.month}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold leading-tight text-navy">{m.timeRange}</p>
                    <p className="mt-0.5 text-xs text-text-mid">Horaires en {m.timezoneLabel}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset",
                      status.badge
                    )}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="flex flex-col gap-4 p-4">
                  {/* Avec qui ? */}
                  <Link href={`/membres/${m.partner.id}`} className="group flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={m.partner.avatarUrl ?? undefined} alt={m.partner.name} />
                      <AvatarFallback>{initials(m.partner.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                        {m.sent ? "Demande envoyée à" : "Demande reçue de"}
                      </p>
                      <p className="truncate text-base font-bold text-navy group-hover:underline">
                        {m.partner.name}
                      </p>
                      <p className="truncate text-sm text-text-mid">
                        {[m.partner.title, m.partner.companyName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
                  </Link>

                  {/* Pourquoi ? */}
                  <blockquote className="border-l-4 border-gold bg-gold-pale/50 py-2 pl-3 pr-2 text-sm leading-relaxed text-text">
                    {m.reason}
                  </blockquote>

                  {m.responseMessage && (
                    <div className="rounded-lg border border-navy/20 bg-navy-light/40 p-3 text-sm">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-navy">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                        {m.sent ? `Message de ${m.partner.name}` : "Votre message"}
                      </p>
                      <p className="leading-relaxed text-text">{m.responseMessage}</p>
                      {m.sent && (
                        <Link
                          href={`/messagerie?new=${m.partner.id}`}
                          className="mt-2 inline-block text-sm font-semibold text-navy-mid underline"
                        >
                          Lui répondre
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Où ? */}
                  <div className="flex items-start gap-3 text-sm">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-light text-navy">
                      <MapPin className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">{m.zone}</p>
                      {m.accessInstructions && (
                        <p className="text-text-mid">{m.accessInstructions}</p>
                      )}
                    </div>
                  </div>

                  {m.status === "PENDING" && (
                    <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      <Clock className="h-4 w-4 shrink-0" aria-hidden />
                      Réponse attendue avant le {m.expiresLabel}
                    </p>
                  )}

                  {m.partner.contact && (
                    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {m.partner.contact.phone && (
                        <a
                          href={`tel:${m.partner.contact.phone.replace(/\s/g, "")}`}
                          className={CONTACT_ROW}
                        >
                          <Phone className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                          <span className="flex-1">{m.partner.contact.phone}</span>
                          <span className="text-xs font-semibold text-text-muted">Appeler</span>
                        </a>
                      )}
                      <a href={`mailto:${m.partner.contact.email}`} className={CONTACT_ROW}>
                        <Mail className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{m.partner.contact.email}</span>
                        <span className="text-xs font-semibold text-text-muted">Écrire</span>
                      </a>
                    </div>
                  )}

                  {m.googleCalendarUrl && (
                    <div className="grid grid-cols-2 gap-2">
                      {/* Fichier .ics : feuille « Ajouter à l'agenda » sur iPhone, Google Agenda sur Android. */}
                      <Button asChild variant="outline" className="h-11">
                        <a href={`/api/rendez-vous/${m.id}/ics`}>
                          <CalendarPlus className="h-4 w-4" aria-hidden /> Mon agenda
                        </a>
                      </Button>
                      <Button asChild variant="outline" className="h-11">
                        <a href={m.googleCalendarUrl} target="_blank" rel="noreferrer">
                          Google Agenda
                        </a>
                      </Button>
                    </div>
                  )}

                  {m.status === "PENDING" && (
                    <div className={cn("grid gap-2", received ? "grid-cols-2" : "grid-cols-1")}>
                      {received ? (
                        <>
                          <Button
                            variant="outline"
                            className="h-11"
                            disabled={busy !== null}
                            onClick={() => {
                              setMessage("");
                              setResponding({ id: m.id, kind: "decline", name: m.partner.name });
                            }}
                          >
                            Refuser
                          </Button>
                          <Button
                            className="h-11"
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
                          variant="outline"
                          className="h-11"
                          disabled={busy !== null}
                          onClick={() => setConfirming({ id: m.id, name: m.partner.name })}
                        >
                          Retirer la demande
                        </Button>
                      )}
                    </div>
                  )}
                </div>
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
