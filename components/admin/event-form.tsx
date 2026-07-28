"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { EventType, Tier } from "@prisma/client";

import { createEvent, updateEvent } from "@/app/actions/admin-events";
import { EVENT_IMAGE_ALLOWED_MIME_TYPES, EVENT_IMAGE_MAX_BYTES } from "@/lib/validations/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPES: { value: EventType; label: string }[] = [
  { value: "SUMMIT", label: "Summit annuel" },
  { value: "DINER", label: "Dîner privé" },
  { value: "WEBINAIRE", label: "Webinaire" },
  { value: "RENCONTRE", label: "Rencontre B2B" },
];

const TIERS: { value: Tier; label: string }[] = [
  { value: "MEMBER", label: "Tous membres" },
  { value: "EXECUTIVE", label: "Executive minimum" },
  { value: "CHAIRMAN", label: "Chairman uniquement" },
];

export interface EventFormValues {
  title: string;
  type: EventType;
  description: string;
  programText: string;
  speakersText: string;
  location: string;
  isOnline: boolean;
  zoomMeetingId: string;
  date: string; // datetime-local string, e.g. "2026-10-14T19:30"
  capacity: string;
  minTier: Tier;
  price: string;
  imageUrl: string;
}

const EMPTY_VALUES: EventFormValues = {
  title: "",
  type: "RENCONTRE",
  description: "",
  programText: "",
  speakersText: "",
  location: "",
  isOnline: false,
  zoomMeetingId: "",
  date: "",
  capacity: "50",
  minTier: "MEMBER",
  price: "0",
  imageUrl: "",
};

interface EventFormProps {
  mode: "create" | "edit";
  eventId?: string;
  initialValues?: Partial<EventFormValues>;
}

/**
 * E3-T05 — création/édition événement. Programme et intervenants s'éditent
 * en texte libre (une ligne = un élément) plutôt qu'avec un éditeur de blocs
 * — voir lib/event-content.ts pour le format exact et la justification.
 */
export function EventForm({ mode, eventId, initialValues }: EventFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<EventFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (!EVENT_IMAGE_ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError("Format non supporté (JPG, PNG ou WEBP uniquement).");
      return;
    }
    if (file.size > EVENT_IMAGE_MAX_BYTES) {
      setUploadError("Fichier trop volumineux (5 Mo max).");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/events/image", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Échec de l'envoi de l'image.");
        return;
      }
      set("imageUrl", json.data.url);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...values,
        capacity: values.capacity,
        price: values.price,
      };

      if (mode === "create") {
        const result = await createEvent(payload);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push(`/admin/evenements/${result.data.id}/editer`);
      } else {
        const result = await updateEvent(eventId!, payload);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push(`/admin/evenements/${eventId}/editer`);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-title">Titre de l&apos;événement *</Label>
              <Input
                id="ev-title"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-type">Type d&apos;événement *</Label>
              <Select value={values.type} onValueChange={(v) => set("type", v as EventType)}>
                <SelectTrigger id="ev-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-description">Description *</Label>
              <Textarea
                id="ev-description"
                rows={4}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date & lieu</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-date">Date et heure *</Label>
              <Input
                id="ev-date"
                type="datetime-local"
                value={values.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.isOnline}
                onCheckedChange={(v) => set("isOnline", v === true)}
              />
              Événement en ligne
            </label>

            {values.isOnline ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-zoom">ID réunion Zoom</Label>
                <Input
                  id="ev-zoom"
                  value={values.zoomMeetingId}
                  onChange={(e) => set("zoomMeetingId", e.target.value)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-location">Lieu *</Label>
                <Input
                  id="ev-location"
                  placeholder="ex. Hôtel Carlton, Antananarivo"
                  value={values.location}
                  onChange={(e) => set("location", e.target.value)}
                  required
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Programme</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={6}
              placeholder={"19h30 — Accueil cocktail\n20h00 — Dîner\n21h00 — Table ronde"}
              value={values.programText}
              onChange={(e) => set("programText", e.target.value)}
            />
            <p className="mt-1.5 text-xs text-text-muted">Une ligne par étape du programme.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Intervenants</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              placeholder={"Sarah Razanamahery | DG | BNI Madagascar"}
              value={values.speakersText}
              onChange={(e) => set("speakersText", e.target.value)}
            />
            <p className="mt-1.5 text-xs text-text-muted">
              Une ligne par intervenant, format « Nom | Poste | Entreprise ».
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bannière de l&apos;événement</CardTitle>
          </CardHeader>
          <CardContent>
            {values.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.imageUrl}
                alt=""
                className="mb-3 aspect-video w-full rounded-md object-cover"
              />
            )}
            <Input
              type="file"
              accept={EVENT_IMAGE_ALLOWED_MIME_TYPES.join(",")}
              onChange={handleImageChange}
              disabled={uploading}
            />
            <p className="mt-1.5 text-xs text-text-muted">
              {uploading ? "Envoi…" : "PNG, JPG · Max 5 Mo · Ratio 16:9 recommandé"}
            </p>
            {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Capacité & accès</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-capacity">Capacité maximale *</Label>
              <Input
                id="ev-capacity"
                type="number"
                min={1}
                value={values.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-tier">Tier minimum requis</Label>
              <Select value={values.minTier} onValueChange={(v) => set("minTier", v as Tier)}>
                <SelectTrigger id="ev-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tarification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-price">Prix (Ar) — 0 = gratuit / inclus</Label>
              <Input
                id="ev-price"
                type="number"
                min={0}
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="w-full justify-center" disabled={saving}>
          {saving
            ? "Enregistrement…"
            : mode === "create"
              ? "Créer l'événement (brouillon)"
              : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
