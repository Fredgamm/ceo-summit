"use client";

import { useState } from "react";

/** Rapport QA du 1er oct. 2026 (§3.3) — aperçu seul, pas d'édition : iframe isolée sur le HTML déjà rendu côté serveur. */
export function TemplatePreview({ html }: { html: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start text-xs font-semibold text-navy underline underline-offset-2"
      >
        {open ? "Masquer l'aperçu" : "Aperçu"}
      </button>
      {open && (
        <iframe
          title="Aperçu du template"
          srcDoc={html}
          sandbox=""
          className="h-[500px] w-full rounded-lg border border-border bg-white"
        />
      )}
    </div>
  );
}
