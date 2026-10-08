"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { generateMeetingSlots } from "@/app/actions/admin-meetings";
import { SLOT_DURATIONS, buildSlotGrid } from "@/lib/meeting-slots";
import { formatDayKey } from "@/lib/event-timezone";
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
 * Module 21 lot 2 — génération de la grille (conception/21 P1). Le nombre
 * de créneaux est calculé en direct avec la même fonction que le serveur.
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
  const [pauseStart, setPauseStart] = React.useState("12:30");
  const [pauseEnd, setPauseEnd] = React.useState("14:00");
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => setDuration(defaultDuration), [defaultDuration]);

  const input = { days, dayStart, dayEnd, durationMinutes: duration, pauseStart, pauseEnd };
  const preview = buildSlotGrid({ ...input, timeZone });

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
          ? `${result.data.created} créneau(x) ajouté(s), ${result.data.skipped} ignoré(s) car ils chevauchent un créneau existant.`
          : `${result.data.created} créneau(x) créé(s).`
      );
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Jours</Label>
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grid-start">De</Label>
          <Input
            id="grid-start"
            type="time"
            value={dayStart}
            onChange={(e) => setDayStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grid-end">À</Label>
          <Input
            id="grid-end"
            type="time"
            value={dayEnd}
            onChange={(e) => setDayEnd(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grid-duration">Durée</Label>
          <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger id="grid-duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLOT_DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grid-pause-start">Pause de</Label>
          <Input
            id="grid-pause-start"
            type="time"
            value={pauseStart}
            onChange={(e) => setPauseStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grid-pause-end">à</Label>
          <Input
            id="grid-pause-end"
            type="time"
            value={pauseEnd}
            onChange={(e) => setPauseEnd(e.target.value)}
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-text-muted">Laissez la pause vide pour ne pas en mettre.</p>

      <p className="text-sm text-text-mid">
        {preview.ok ? (
          <>
            <strong className="text-navy">{preview.slots.length} créneau(x)</strong> seront générés.
            {published &&
              " Les créneaux existants sont conservés : seuls ceux qui ne les chevauchent pas sont ajoutés, directement publiés."}
          </>
        ) : (
          <span className="text-red-700">{preview.error}</span>
        )}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div>
        <Button
          type="button"
          disabled={!preview.ok || running}
          onClick={() => (!published && draftCount > 0 ? setConfirmOpen(true) : generate())}
        >
          {running ? "Génération…" : published ? "Ajouter ces créneaux" : "Générer la grille"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remplacer la grille"
        description={`Les ${draftCount} créneau(x) en brouillon seront remplacés par la nouvelle grille.`}
        confirmLabel="Remplacer"
        onConfirm={generate}
      />
    </div>
  );
}
