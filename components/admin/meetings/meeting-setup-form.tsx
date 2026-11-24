"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { saveMeetingSetup } from "@/app/actions/admin-meetings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Module 21 lot 2 — lieu des rendez-vous et indications d'accès.
 * 5 nov. 2026 : la durée n'est plus demandée ici (elle l'était aussi à
 * l'étape 2, ce qui prêtait à confusion) ; la valeur enregistrée est
 * conservée telle quelle et sert de durée proposée par défaut à l'étape 2.
 */
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
        <Label htmlFor="meeting-zone">Nom du lieu *</Label>
        <Input
          id="meeting-zone"
          placeholder="ex. Salle B2B, niveau 1"
          value={values.zone}
          onChange={(e) => setValues((v) => ({ ...v, zone: e.target.value }))}
          maxLength={140}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meeting-access">Comment s&apos;y rendre *</Label>
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
          Ce texte est envoyé aux participants dans l&apos;e-mail qui confirme chaque rendez-vous.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer le lieu"}
        </Button>
        {saved && <span className="text-sm text-emerald-700">✓ Lieu enregistré.</span>}
      </div>
    </form>
  );
}
