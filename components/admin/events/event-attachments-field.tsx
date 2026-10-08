"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, FileText, Trash2 } from "lucide-react";

import {
  EVENT_ATTACHMENT_ACCEPT,
  EVENT_ATTACHMENT_MAX_BYTES,
  EVENT_ATTACHMENT_MAX_COUNT,
  EVENT_ATTACHMENT_TYPES_LABEL,
  attachmentKindLabel,
  formatFileSize,
} from "@/lib/event-attachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface EventAttachmentValue {
  title: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Titre proposé à partir du nom du fichier : « plan-acces_2027.pdf » → « plan acces 2027 ». */
function defaultTitle(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/**
 * Module 21 D17 (8 oct. 2026) — pièces jointes de l'événement, à la place
 * de « Intervenants ». Chaque fichier est envoyé dès sa sélection ; la
 * liste (titres, ordre) est enregistrée avec le formulaire.
 */
export function EventAttachmentsField({
  value,
  onChange,
}: {
  value: EventAttachmentValue[];
  onChange: (next: EventAttachmentValue[]) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const full = value.length >= EVENT_ATTACHMENT_MAX_COUNT;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);

    const room = EVENT_ATTACHMENT_MAX_COUNT - value.length;
    if (files.length > room) {
      setError(`${EVENT_ATTACHMENT_MAX_COUNT} pièces jointes au maximum.`);
      return;
    }
    const tooBig = files.find((f) => f.size > EVENT_ATTACHMENT_MAX_BYTES);
    if (tooBig) {
      setError(`« ${tooBig.name} » est trop volumineux (20 Mo max).`);
      return;
    }

    setUploading(true);
    const added: EventAttachmentValue[] = [];
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/admin/events/attachment", { method: "POST", body: formData });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(`« ${file.name} » : ${json.error ?? "échec de l'envoi."}`);
          break;
        }
        added.push({ ...json.data, title: defaultTitle(file.name) });
      }
    } finally {
      if (added.length > 0) onChange([...value, ...added]);
      setUploading(false);
    }
  }

  function update(index: number, patch: Partial<EventAttachmentValue>) {
    onChange(value.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-col gap-2">
          {value.map((attachment, index) => (
            <li
              key={attachment.url}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-navy-mid" aria-hidden />
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="Titre affiché"
                  value={attachment.title}
                  maxLength={140}
                  onChange={(e) => update(index, { title: e.target.value })}
                />
                <p className="mt-1 truncate text-xs text-text-muted">
                  {attachmentKindLabel(attachment.mimeType)} ·{" "}
                  {formatFileSize(attachment.sizeBytes)} · {attachment.fileName}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Monter"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Descendre"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Retirer"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EVENT_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={handleFiles}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || full}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Envoi en cours…" : "＋ Ajouter des fichiers"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        {EVENT_ATTACHMENT_TYPES_LABEL} · 20 Mo max par fichier · {EVENT_ATTACHMENT_MAX_COUNT}{" "}
        fichiers max. Téléchargeables par les participants sur la fiche de l&apos;événement. Les
        changements sont pris en compte à l&apos;enregistrement.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
