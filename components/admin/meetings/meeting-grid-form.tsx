"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { generateMeetingSlots } from "@/app/actions/admin-meetings";
import { SLOT_DURATIONS, buildSlotGrid } from "@/lib/meeting-slots";
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
  const [dayStart, setDayStart] = React.useState("09:00");
  const [dayEnd, setDayEnd] = React.useState("17:00");
  const [duration, setDuration] = React.useState(defaultDuration);
  const [withPause, setWithPause] = React.useState(true);
  const [pauseStart, setPauseStart] = React.useState("12:30");
  const [pauseEnd, setPauseEnd] = React.useState("14:00");
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => setDuration(defaultDuration), [defaultDuration]);

  const input = {
    days,
    dayStart,
    dayEnd,
    durationMinutes: duration,
    pauseStart: withPause ? pauseStart : "",
    pauseEnd: withPause ? pauseEnd : "",
  };
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
        <Label>À quelles heures les participants peuvent-ils se rencontrer ?</Label>
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-mid">
          <span>De</span>
          <Input
            aria-label="Heure de début"
            type="time"
            className="w-32"
            value={dayStart}
            onChange={(e) => setDayStart(e.target.value)}
          />
          <span>à</span>
          <Input
            aria-label="Heure de fin"
            type="time"
            className="w-32"
            value={dayEnd}
            onChange={(e) => setDayEnd(e.target.value)}
          />
        </div>
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

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-navy">
          <Checkbox checked={withPause} onCheckedChange={(c) => setWithPause(c === true)} />
          Prévoir une pause sans rendez-vous (ex. déjeuner)
        </label>
        {withPause && (
          <div className="flex flex-wrap items-center gap-2 pl-6 text-sm text-text-mid">
            <span>De</span>
            <Input
              aria-label="Début de la pause"
              type="time"
              className="w-32"
              value={pauseStart}
              onChange={(e) => setPauseStart(e.target.value)}
            />
            <span>à</span>
            <Input
              aria-label="Fin de la pause"
              type="time"
              className="w-32"
              value={pauseEnd}
              onChange={(e) => setPauseEnd(e.target.value)}
            />
          </div>
        )}
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
