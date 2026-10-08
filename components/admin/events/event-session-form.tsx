"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createEventSession, updateEventSession } from "@/app/actions/admin-event-sessions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface EventSessionFormValues {
  title: string;
  description: string;
  room: string;
  startTime: string; // datetime-local string
  endTime: string;
  speakersText: string;
}

const EMPTY_VALUES: EventSessionFormValues = {
  title: "",
  description: "",
  room: "",
  startTime: "",
  endTime: "",
  speakersText: "",
};

interface EventSessionFormProps {
  mode: "create" | "edit";
  eventId: string;
  sessionId?: string;
  initialValues?: Partial<EventSessionFormValues>;
  /** Module 21 D19 — « heure de La Réunion » : fuseau dans lequel les heures sont lues. */
  timezoneLabel: string;
}

/**
 * E10 — agenda dynamique multi-salles (5 août 2026). Une session = un
 * créneau dans une salle/piste ; plusieurs sessions peuvent partager le
 * même horaire dans des salles différentes (ateliers parallèles) — c'est
 * la page liste (`/admin/evenements/[id]/agenda`) qui les groupe par jour,
 * pas ce formulaire.
 */
export function EventSessionForm({
  mode,
  eventId,
  sessionId,
  initialValues,
  timezoneLabel,
}: EventSessionFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<EventSessionFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function set<K extends keyof EventSessionFormValues>(key: K, value: EventSessionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await createEventSession(eventId, values)
          : await updateEventSession(sessionId!, values);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/admin/evenements/${eventId}/agenda`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[560px] rounded-lg border border-border bg-white p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-title">Titre *</Label>
          <Input
            id="session-title"
            placeholder="ex. Table ronde : Économie Océan Indien"
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={140}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-room">Salle / piste *</Label>
          <Input
            id="session-room"
            placeholder="ex. Salle plénière, Salle B — Atelier Tech…"
            value={values.room}
            onChange={(e) => set("room", e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-start">Début *</Label>
            <Input
              id="session-start"
              type="datetime-local"
              value={values.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-end">Fin *</Label>
            <Input
              id="session-end"
              type="datetime-local"
              value={values.endTime}
              onChange={(e) => set("endTime", e.target.value)}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-text-muted">Heures saisies en {timezoneLabel}.</p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-desc">Description</Label>
          <Textarea
            id="session-desc"
            rows={3}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-speakers">Intervenants de cette session</Label>
          <Textarea
            id="session-speakers"
            rows={3}
            placeholder={"Sarah Razanamahery | DG | BNI Madagascar"}
            value={values.speakersText}
            onChange={(e) => set("speakersText", e.target.value)}
          />
          <p className="text-xs text-text-muted">
            Une ligne par intervenant, format « Nom | Poste | Entreprise ».
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSubmit} disabled={submitting} className="justify-center">
          {submitting
            ? "Enregistrement…"
            : mode === "create"
              ? "✓ Créer la session"
              : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
