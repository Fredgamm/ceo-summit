"use client";

import { Check } from "lucide-react";

import { ReferentialSearchButton } from "@/components/referentials/referential-search-button";
import { visibleReferentialOptions } from "@/lib/referential-options";
import { cn } from "@/lib/utils";

interface SectorPickerProps {
  available: readonly string[];
  selected: readonly string[];
  onToggle: (sector: string) => void;
}

/**
 * 21 oct. 2026 — secteurs d'intérêt en liste à cocher, une ligne par secteur
 * (édition du profil, onboarding). Remplace une grille de cases à 2 colonnes
 * où les libellés longs (« Agence de communication & Relations publiques »)
 * s'étalaient sur 4 lignes sur mobile ; des pastilles ont été essayées puis
 * écartées (trop chargées).
 */
export function SectorPicker({ available, selected, onToggle }: SectorPickerProps) {
  return (
    <div>
      <p className="mb-2 text-xs text-text-muted">
        {selected.length === 0
          ? "Aucun secteur sélectionné"
          : `${selected.length} sélectionné${selected.length > 1 ? "s" : ""}`}
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {visibleReferentialOptions(available, selected).map((sector) => {
          const isSelected = selected.includes(sector);
          return (
            <button
              key={sector}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => onToggle(sector)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-surface",
                isSelected ? "font-semibold text-navy" : "text-text"
              )}
            >
              <span>{sector}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  isSelected ? "border-navy bg-navy text-white" : "border-border bg-white"
                )}
              >
                {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        <ReferentialSearchButton
          options={available}
          title="Rechercher un secteur"
          selected={selected}
          onPick={(sector) => {
            if (!selected.includes(sector)) onToggle(sector);
          }}
          label="Rechercher un autre secteur…"
          className="flex w-full items-center px-4 py-3 text-left text-sm font-semibold text-navy-mid hover:bg-surface"
        />
      </div>
    </div>
  );
}
