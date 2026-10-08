"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EventType } from "@prisma/client";

import { createEvent, updateEvent } from "@/app/actions/admin-events";
import { EVENT_IMAGE_ALLOWED_MIME_TYPES, EVENT_IMAGE_MAX_BYTES } from "@/lib/validations/event";
import { DEFAULT_EVENT_TIMEZONE, EVENT_TIMEZONES, timezoneLabel } from "@/lib/event-timezone";
import {
  EventAttachmentsField,
  type EventAttachmentValue,
} from "@/components/admin/events/event-attachments-field";
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

export interface EventFormValues {
  title: string;
  type: EventType;
  description: string;
  location: string;
  isOnline: boolean;
  zoomMeetingId: string;
  /** Module 21 D19 — fuseau IANA de l'événement ; `date`/`endDate` sont lues dans ce fuseau. */
  timezone: string;
  date: string; // datetime-local string, e.g. "2026-10-14T19:30"
  endDate: string;
  capacity: string;
  price: string;
  imageUrl: string;
  /** Module 21 D17 — pièces jointes, à la place des intervenants (D18). */
  attachments: EventAttachmentValue[];
}

const EMPTY_VALUES: EventFormValues = {
  title: "",
  type: "RENCONTRE",
  description: "",
  location: "",
  isOnline: false,
  zoomMeetingId: "",
  timezone: DEFAULT_EVENT_TIMEZONE,
  date: "",
  endDate: "",
  capacity: "50",
  price: "0",
  imageUrl: "",
  attachments: [],
};

interface EventFormProps {
  mode: "create" | "edit";
  eventId?: string;
  initialValues?: Partial<EventFormValues>;
  /**
   * Nombre d'offres (`Plan.eventId`) déjà rattachées à cet évènement — dès
   * qu'il y en a au moins une, elles remplacent ce prix unique sur la fiche
   * publique (`/evenements/[id]`, même garde-fou dans `registerForEvent`) :
   * le champ ci-dessous devient inerte tant qu'elles restent actives.
   */
  offersCount?: number;
}

/**
 * E3-T05 — création/édition événement. Le Programme se gère dans l'agenda
 * multi-salles, les intervenants par session ; la section « Intervenants »
 * est remplacée par les pièces jointes (module 21, D17-D18).
 */
export function EventForm({ mode, eventId, initialValues, offersCount = 0 }: EventFormProps) {
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
              <Label htmlFor="ev-timezone">Fuseau horaire de l&apos;événement *</Label>
              <Select value={values.timezone} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger id="ev-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TIMEZONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-date">Début (date et heure) *</Label>
                <Input
                  id="ev-date"
                  type="datetime-local"
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-end-date">Fin (date et heure) *</Label>
                <Input
                  id="ev-end-date"
                  type="datetime-local"
                  value={values.endDate}
                  min={values.date || undefined}
                  onChange={(e) => set("endDate", e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-text-muted">
              Heures saisies en {timezoneLabel(values.timezone)} : c&apos;est aussi le cas du
              Programme et des créneaux de rendez-vous, et c&apos;est l&apos;heure affichée aux
              participants. Changer le fuseau conserve les heures affichées. Le début et la fin sont
              transmis à Evolia avec chaque inscription.
            </p>

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

        {mode === "edit" && (
          <Card>
            <CardHeader>
              <CardTitle>Programme</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-mid">
                Le programme se gère désormais depuis l&apos;agenda multi-salles (créneaux horaires,
                salle/piste, intervenants par session).
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href={`/admin/evenements/${eventId}/agenda`}>Gérer l&apos;agenda →</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Pièces jointes</CardTitle>
          </CardHeader>
          <CardContent>
            <EventAttachmentsField
              value={values.attachments}
              onChange={(next) => set("attachments", next)}
            />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tarification</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {offersCount > 0 && (
              <Alert>
                <AlertDescription>
                  {offersCount} offre(s) sont déjà configurées pour cet évènement — elles remplacent
                  ce prix unique sur la fiche publique (les participants choisissent parmi elles, ce
                  champ est ignoré tant qu&apos;au moins une reste active).
                  {eventId && (
                    <>
                      {" "}
                      <Link
                        href={`/admin/plans?eventId=${eventId}`}
                        className="font-semibold underline"
                      >
                        Gérer les offres →
                      </Link>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-price">
                Prix (Ar) — 0 = gratuit / inclus
                {offersCount > 0 && " (inscription à prix unique, sans offre configurée)"}
              </Label>
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
