"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { ReferentialSearchDialog } from "@/components/referentials/referential-search-dialog";

interface ReferentialSearchButtonProps {
  options: readonly string[];
  title: string;
  selected?: readonly string[];
  onPick: (value: string) => void;
  className?: string;
}

/**
 * Déclencheur « Rechercher… » pour les listes en pastilles : complète les
 * 10 valeurs prioritaires affichées par une recherche sur tout le catalogue.
 */
export function ReferentialSearchButton({
  options,
  title,
  selected,
  onPick,
  className,
}: ReferentialSearchButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Search className="mr-1 inline h-3 w-3" />
        Rechercher…
      </button>
      <ReferentialSearchDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        options={options}
        selected={selected}
        onPick={onPick}
      />
    </>
  );
}
