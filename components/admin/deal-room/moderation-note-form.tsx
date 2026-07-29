"use client";

import * as React from "react";

import { saveModerationNote } from "@/app/actions/admin-deal-room";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ModerationNoteForm({
  opportunityId,
  initialNote,
}: {
  opportunityId: string;
  initialNote: string;
}) {
  const [note, setNote] = React.useState(initialNote);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const result = await saveModerationNote(opportunityId, note);
      if (result.success) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder="Ajouter une note sur cette opportunité…"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {saved && <span className="text-xs text-emerald-600">Note enregistrée</span>}
      </div>
    </div>
  );
}
