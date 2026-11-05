"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { generateMeetingSlots } from "@/app/actions/admin-meetings";
import { SLOT_DURATIONS, buildSlotGrid, timeToMinutes, type TimeRange } from "@/lib/meeting-slots";
import { formatDayKey, formatTimeInZone, zonedDayKey } from "@/lib/event-timezone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Module 21 lot 2 — création des créneaux (conception/21 P1). Le nombre
 * de créneaux est calculé en direct avec la même fonction que le serveur.
 * 5 nov. 2026 : formulaire réécrit en questions simples, pause
 * optionnelle par case à cocher, et aperçu des horaires avant création.
 */
export function MeetingGridForm({
  eventId,
  eventDays,
  defaultDuration,
  timeZone,
  published,
  draftCount,
}: {
  eventId: string;
  eventDays: string[];
  defaultDuration: number;
  timeZone: string;
  published: boolean;
  draftCount: number;
}) {
  const router = useRouter();
  const [days, setDays] = React.useState<string[]>(eventDays);
  // Plages proposées par défaut : une le matin, une l'après-midi.
  const [ranges, setRanges] = React.useState<TimeRange[]>([
    { start: "09:00", end: "12:30" },
    { start: "14:00", end: "17:00" },
  ]);
  const [duration, setDuration] = React.useState(defaultDuration);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => setDuration(defaultDuration), [defaultDuration]);

  const input = { days, ranges, durationMinutes: duration };

  function updateRange(index: number, patch: Partial<TimeRange>) {
    setRanges((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRange() {
    setRanges((prev) => {
      // La nouvelle plage commence 1 h après la dernière, pour une heure.
      const last = prev[prev.length - 1];
      const from = last ? (timeToMinutes(last.end) ?? 16 * 60) + 60 : 9 * 60;
      const start = Math.min(from, 22 * 60);
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return [...prev, { start: fmt(start), end: fmt(Math.min(start + 60, 23 * 60 + 59)) }];
    });
  }

  function removeRange(index: number) {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  }
  const preview = buildSlotGrid({ ...input, timeZone });

  // Aperçu : les horaires sont les mêmes chaque jour, on montre ceux du premier.
  const previewTimes = preview.ok
    ? preview.slots
        .filter((s) => zonedDayKey(s.startTime, timeZone) === days[0])
        .map((s) => formatTimeInZone(s.startTime, timeZone))
    : [];

  function toggleDay(day: string, checked: boolean) {
    setDays((prev) => (checked ? [...prev, day].sort() : prev.filter((d) => d !== day)));
  }

  async function generate() {
    setError(null);
    setMessage(null);
    setRunning(true);
    try {
      const result = await generateMeetingSlots(eventId, input);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage(
        result.data.skipped > 0
          ? `✓ ${result.data.created} créneau(x) ajouté(s). ${result.data.skipped} n'ont pas été ajoutés car ils tombent en même temps qu'un créneau existant.`
          : `✓ ${result.data.created} créneau(x) créé(s). Vérifiez-les ci-dessous puis publiez-les.`
      );
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Quels jours ?</Label>
        <div className="flex flex-wrap gap-4">
          {eventDays.map((day) => (
            <label key={day} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={days.includes(day)}
                onCheckedChange={(c) => toggleDay(day, c === true)}
              />
              {formatDayKey(day)}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Pendant quelles plages horaires les participants peuvent-ils se rencontrer ?</Label>
        <p className="text-xs text-text-muted">
          Ajoutez autant de plages que nécessaire (ex. 11:00 à 12:00 puis 15:00 à 16:00). Entre deux
          plages, aucun rendez-vous n&apos;est possible.
        </p>
        <div className="flex flex-col gap-2">
          {ranges.map((range, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm text-text-mid">
              <span className="w-16 font-medium text-navy">Plage {i + 1}</span>
              <span>de</span>
              <Input
                aria-label={`Début de la plage ${i + 1}`}
                type="time"
                className="w-32"
                value={range.start}
                onChange={(e) => updateRange(i, { start: e.target.value })}
              />
              <span>à</span>
              <Input
                aria-label={`Fin de la plage ${i + 1}`}
                type="time"
                className="w-32"
                value={range.end}
                onChange={(e) => updateRange(i, { end: e.target.value })}
              />
              {ranges.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRange(i)}
                  aria-label={`Retirer la plage ${i + 1}`}
                >
                  Retirer
                </Button>
              )}
            </div>
          ))}
        </div>
        {ranges.length < 12 && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={addRange}>
              + Ajouter une plage horaire
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="grid-duration">Combien de temps dure un rendez-vous ?</Label>
        <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
          <SelectTrigger id="grid-duration" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SLOT_DURATIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d} minutes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        {preview.ok ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-mid">
              <strong className="text-navy">
                {preview.slots.length} créneau(x) de {duration} minutes
              </strong>{" "}
              seront créés
              {days.length > 1
                ? `, soit ${previewTimes.length} par jour sur ${days.length} jours`
                : ""}
              . Horaires de début :
            </p>
            <div className="flex flex-wrap gap-1.5">
              {previewTimes.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-border bg-white px-2 py-0.5 text-xs font-medium text-navy"
                >
                  {t}
                </span>
              ))}
            </div>
            {published && (
              <p className="text-xs text-text-muted">
                Les créneaux déjà publiés sont gardés : seuls les nouveaux horaires qui ne tombent
                pas en même temps sont ajoutés, et ils sont visibles tout de suite.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-red-700">{preview.error}</p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!preview.ok || running}
          onClick={() => (!published && draftCount > 0 ? setConfirmOpen(true) : generate())}
        >
          {running
            ? "Création…"
            : published
              ? "Ajouter ces créneaux"
              : `Créer ${preview.ok ? `ces ${preview.slots.length} ` : "les "}créneaux`}
        </Button>
        {!published && (
          <span className="text-xs text-text-muted">
            Les participants ne voient rien tant que vous n&apos;avez pas publié (étape 3).
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remplacer les créneaux ?"
        description={`Les ${draftCount} créneau(x) déjà créés (pas encore publiés) seront supprimés et remplacés par ces nouveaux horaires.`}
        confirmLabel="Remplacer"
        onConfirm={generate}
      />
    </div>
  );
}
