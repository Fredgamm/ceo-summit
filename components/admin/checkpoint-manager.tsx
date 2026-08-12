"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createEventCheckpoint, deleteEventCheckpoint } from "@/app/actions/admin-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface CheckpointWithCount {
  id: string;
  name: string;
  checkedInCount: number;
}

/**
 * Contrôle d'accès multi-points (7 août 2026) — gestion des postes de scan
 * d'un évènement (créer/supprimer), avec le compte de check-ins déjà
 * effectués par poste. Compte affiché ici vient du rendu serveur ; le
 * compteur temps réel pendant le scan lui-même vit dans CheckinScanner
 * (Socket.io), pas ici — cette liste sert surtout à la mise en place avant
 * l'évènement.
 */
export function CheckpointManager({
  eventId,
  checkpoints,
}: {
  eventId: string;
  checkpoints: CheckpointWithCount[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await createEventCheckpoint(eventId, name);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setName("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(checkpointId: string) {
    await deleteEventCheckpoint(checkpointId);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
        Postes de contrôle
      </p>

      {checkpoints.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {checkpoints.map((cp) => (
            <li
              key={cp.id}
              className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm"
            >
              <span>
                {cp.name} <span className="text-text-muted">— {cp.checkedInCount} entrée(s)</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(cp.id)}
                className="h-auto p-1 text-red-600"
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          placeholder="ex. Entrée VIP"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "…" : "+ Ajouter"}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
