"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { saveMeetingSetup } from "@/app/actions/admin-meetings";
import { SLOT_DURATIONS } from "@/lib/meeting-slots";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Module 21 lot 2 — zone RDV, indications d'accès et durée par défaut des créneaux. */
export function MeetingSetupForm({
  eventId,
  initialValues,
}: {
  eventId: string;
  initialValues: { zone: string; accessInstructions: string; slotDurationMinutes: number };
}) {
  const router = useRouter();
  const [values, setValues] = React.useState(initialValues);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const result = await saveMeetingSetup(eventId, values);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meeting-zone">Zone RDV *</Label>
        <Input
          id="meeting-zone"
          placeholder="ex. Espace B2B, niveau 1"
          value={values.zone}
          onChange={(e) => setValues((v) => ({ ...v, zone: e.target.value }))}
          maxLength={140}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meeting-access">Indications d&apos;accès *</Label>
        <Textarea
          id="meeting-access"
          rows={3}
          placeholder="ex. Au niveau 1, à gauche de l'accueil. Présentez votre badge à l'hôtesse."
          value={values.accessInstructions}
          onChange={(e) => setValues((v) => ({ ...v, accessInstructions: e.target.value }))}
          maxLength={1000}
          required
        />
        <p className="text-xs text-text-muted">
          Reprises dans les emails de confirmation de rendez-vous.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meeting-duration">Durée d&apos;un créneau</Label>
        <Select
          value={String(values.slotDurationMinutes)}
          onValueChange={(v) => setValues((s) => ({ ...s, slotDurationMinutes: Number(v) }))}
        >
          <SelectTrigger id="meeting-duration" className="sm:w-48">
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

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {saved && <span className="text-sm text-emerald-700">Enregistré.</span>}
      </div>
    </form>
  );
}
