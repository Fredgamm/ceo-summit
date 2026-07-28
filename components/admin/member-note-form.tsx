"use client";

import * as React from "react";

import { saveMemberNote } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MemberNoteForm({ userId, initialNote }: { userId: string; initialNote: string }) {
  const [note, setNote] = React.useState(initialNote);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const result = await saveMemberNote(userId, note);
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
        placeholder="Ajouter une note interne sur ce membre…"
        rows={4}
      />
      <div className="mt-2 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer la note"}
        </Button>
        {saved && <span className="text-xs text-emerald-700">Enregistrée ✓</span>}
      </div>
    </div>
  );
}
