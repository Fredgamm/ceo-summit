"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { validateEventParticipants } from "@/app/actions/company-participants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface ParticipantCandidate {
  id: string;
  name: string;
  title: string | null;
  isManager: boolean;
}

/**
 * Module 18 §4.9 — le gérant coche qui participe à l'événement de l'offre,
 * dans la limite des places, puis valide : les participants sont inscrits et
 * la liste est transmise à Evolia pour les badges.
 */
export function EventParticipantsForm({
  companyId,
  candidates,
  initialSelected,
  cap,
  validatedAtLabel,
}: {
  companyId: string;
  candidates: ParticipantCandidate[];
  initialSelected: string[];
  cap: number | null;
  validatedAtLabel: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>(initialSelected);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const overCap = cap != null && selected.length > cap;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleValidate() {
    setError(null);
    setSaving(true);
    try {
      const result = await validateEventParticipants(companyId, selected);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success("Liste des participants validée.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {candidates.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
              <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-navy">{c.name}</span>
                {c.isManager && <span className="text-text-muted"> (vous, gérant)</span>}
                {c.title && (
                  <span className="block truncate text-xs text-text-muted">{c.title}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={overCap ? "text-sm font-semibold text-red-600" : "text-sm text-text-mid"}>
          {selected.length}
          {cap != null ? ` / ${cap}` : ""} participant(s)
          {validatedAtLabel && (
            <span className="ml-2 text-xs text-text-muted">
              · liste validée le {validatedAtLabel}
            </span>
          )}
        </span>
        <Button onClick={handleValidate} disabled={saving || overCap}>
          {saving ? "Validation…" : "Valider la liste des participants"}
        </Button>
      </div>

      {overCap && (
        <p className="text-xs text-red-600">
          Votre offre compte {cap} place(s). Retirez des participants, ou achetez des places
          supplémentaires ci-dessous.
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
