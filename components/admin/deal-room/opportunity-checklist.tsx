"use client";

import * as React from "react";

const CHECKLIST_ITEMS = [
  "Contenu conforme à la charte CEO Summit",
  "Informations complètes (titre, description, budget, échéance)",
  "Auteur membre actif en règle",
  "Documents joints vérifiés",
  "Visibilité correctement paramétrée",
  "Pas de doublon existant",
];

/**
 * E8-T06 — "File de modération avec checklist". Aide visuelle pour l'admin
 * avant de décider — non persistée (le backlog ne demande pas de stocker
 * les réponses, seulement de guider la revue).
 */
export function OpportunityChecklist() {
  const [checked, setChecked] = React.useState<boolean[]>(() => CHECKLIST_ITEMS.map(() => false));

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      {CHECKLIST_ITEMS.map((item, i) => (
        <label key={item} className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={checked[i]}
            onChange={() => setChecked((prev) => prev.map((c, idx) => (idx === i ? !c : c)))}
          />
          {item}
        </label>
      ))}
    </div>
  );
}
