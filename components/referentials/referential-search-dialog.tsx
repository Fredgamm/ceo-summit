"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";

import { filterReferentialOptions } from "@/lib/referential-options";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ReferentialSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: readonly string[];
  /** Valeurs déjà choisies, cochées dans la liste. */
  selected?: readonly string[];
  onPick: (value: string) => void;
}

/**
 * Recherche dans tout le catalogue d'un référentiel (secteurs, pays), sans
 * tenir compte des accents ni de la casse. On choisit toujours une valeur
 * existante : pas de saisie libre (rapport QA du 1er oct. 2026, §4).
 */
export function ReferentialSearchDialog({
  open,
  onOpenChange,
  title,
  options,
  selected = [],
  onPick,
}: ReferentialSearchDialogProps) {
  const [query, setQuery] = React.useState("");
  const results = React.useMemo(() => filterReferentialOptions(options, query), [options, query]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function pick(value: string) {
    onPick(value);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Tapez quelques lettres…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results.length > 0) {
                e.preventDefault();
                pick(results[0]);
              }
            }}
          />
        </div>
        <ul className="max-h-72 overflow-y-auto rounded-md border border-border" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-text-muted">
              Aucun résultat. Contactez l&apos;équipe CEO Summit si votre choix manque.
            </li>
          ) : (
            results.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <li key={option} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => pick(option)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface",
                      isSelected && "font-semibold text-navy"
                    )}
                  >
                    {option}
                    {isSelected && <Check className="h-4 w-4 text-gold" />}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
