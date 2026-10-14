"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, MapPin, UserPlus } from "lucide-react";

import { validateEventParticipants } from "@/app/actions/company-participants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface ParticipantCandidate {
  id: string;
  name: string;
  title: string | null;
  isManager: boolean;
}

/** Au-delà, les pastilles de places deviennent illisibles : on n'affiche que le compteur. */
const MAX_SEAT_PIPS = 12;

/**
 * Module 18 §4.9 — le gérant coche qui participe à l'événement de l'offre,
 * dans la limite des places, puis valide : les participants sont inscrits et
 * la liste est transmise à Evolia pour les badges.
 *
 * Refonte UX (14 oct. 2026) — c'est l'écran d'arrivée après paiement : la
 * carte se présente comme un billet d'événement, pose une seule question
 * (« Qui vient ? ») et rend les places visibles à mesure qu'on coche.
 * `children` accueille le formulaire d'invitation, pour les collaborateurs
 * qui n'ont pas encore de compte.
 */
export function EventParticipantsForm({
  companyId,
  candidates,
  initialSelected,
  cap,
  validatedAtLabel,
  event,
  children,
}: {
  companyId: string;
  candidates: ParticipantCandidate[];
  initialSelected: string[];
  cap: number | null;
  validatedAtLabel: string | null;
  event: { title: string; dateLabel: string; location: string | null };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>(initialSelected);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const overCap = cap != null && selected.length > cap;
  const isValidated = validatedAtLabel != null;
  const isDirty =
    selected.length !== initialSelected.length ||
    selected.some((id) => !initialSelected.includes(id));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleValidate() {
    setError(null);
    setSaving(true);
    try {
      const result = await validateEventParticipants(companyId, selected);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success("Liste des participants validée.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="event-participants-title"
      className={cn(
        "overflow-hidden rounded-lg border bg-white shadow-card",
        isValidated ? "border-border" : "border-gold"
      )}
    >
      {/* Talon du billet : l'événement à gauche, les places à droite. */}
      <div className="flex flex-col bg-navy text-white sm:flex-row">
        <div className="flex-1 p-5 sm:p-6">
          {isValidated ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Liste validée le {validatedAtLabel}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-navy">
              Prochaine étape
            </span>
          )}
          <h2 id="event-participants-title" className="mt-3 text-xl font-bold leading-tight">
            {isValidated ? "Vos participants à" : "Qui vient à"}{" "}
            <span className="text-gold">{event.title}</span>
            {isValidated ? "" : " ?"}
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> {event.dateLabel}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {event.location}
              </span>
            )}
          </p>
        </div>

        {cap != null && (
          <div className="flex items-center gap-4 border-t border-dashed border-white/25 px-5 py-4 sm:w-56 sm:flex-col sm:items-start sm:justify-center sm:border-l sm:border-t-0 sm:px-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Places</p>
              <p
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  overCap ? "text-red-300" : "text-white"
                )}
                aria-live="polite"
              >
                {selected.length}
                <span className="text-base font-semibold text-white/50"> / {cap}</span>
              </p>
            </div>
            {cap <= MAX_SEAT_PIPS && (
              <div className="flex flex-wrap gap-1.5" aria-hidden>
                {Array.from({ length: Math.max(cap, selected.length) }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-3 w-3 rounded-full transition-colors duration-200 motion-reduce:transition-none",
                      i >= cap
                        ? "bg-red-400"
                        : i < selected.length
                          ? "bg-gold"
                          : "border border-white/40"
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <p className="text-sm text-text-mid">
          <strong className="font-semibold text-navy">Cochez les personnes qui viennent</strong>,
          puis validez. Chacune reçoit une confirmation et son badge est préparé.
        </p>

        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {candidates.map((c) => {
            const checked = selected.includes(c.id);
            return (
              <li key={c.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface",
                    checked && "bg-gold-pale hover:bg-gold-pale"
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-navy">{c.name}</span>
                    {c.isManager && <span className="text-text-muted"> (vous)</span>}
                    {c.title && (
                      <span className="block truncate text-xs text-text-muted">{c.title}</span>
                    )}
                  </span>
                  {checked && <span className="text-xs font-semibold text-navy">Participe</span>}
                </label>
              </li>
            );
          })}
        </ul>

        {overCap && (
          <p className="text-sm font-medium text-red-600">
            Votre offre compte {cap} place(s). Décochez {selected.length - (cap ?? 0)} personne(s),
            ou ajoutez des places plus bas.
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">
            {selected.length === 0
              ? "Cochez au moins une personne pour valider."
              : isValidated && !isDirty
                ? "Liste à jour. Vous pouvez la modifier à tout moment."
                : `${selected.length} participant(s) sélectionné(s), pas encore validé(s).`}
          </p>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={handleValidate}
            disabled={saving || overCap || selected.length === 0 || (isValidated && !isDirty)}
          >
            {saving
              ? "Validation…"
              : isValidated
                ? "Mettre à jour la liste"
                : `Valider ${selected.length > 0 ? `${selected.length} ` : "les "}participant(s)`}
          </Button>
        </div>
      </div>

      {children && (
        <div className="border-t border-border bg-surface p-5 sm:p-6">
          <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
            <UserPlus className="h-4 w-4" /> Un collaborateur n&apos;est pas dans la liste ?
          </h3>
          <p className="mb-3 mt-1 text-xs text-text-muted">
            Invitez-le : il apparaîtra ici dès qu&apos;il aura créé son compte, et vous pourrez
            alors le cocher.
          </p>
          {children}
        </div>
      )}
    </section>
  );
}
