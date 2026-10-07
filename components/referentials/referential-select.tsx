"use client";

import * as React from "react";

import { visibleReferentialOptions } from "@/lib/referential-options";
import { ReferentialSearchDialog } from "@/components/referentials/referential-search-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Valeur interne du déclencheur « Rechercher… » : jamais transmise à l'appelant. */
const SEARCH_VALUE = "__referential_search__";

interface ReferentialSelectProps {
  options: readonly string[];
  /** "" = aucune valeur choisie (le placeholder s'affiche). */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Titre de la fenêtre de recherche, ex. « Rechercher un pays ». */
  searchTitle: string;
  /** Option « tous » des filtres, affichée en premier. */
  allOption?: { value: string; label: string };
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Sélecteur secteur/pays : les 10 premières valeurs du référentiel, puis
 * « Rechercher… » qui ouvre la recherche sur le catalogue complet. Une
 * valeur trouvée par la recherche reste affichée dans la liste une fois
 * choisie.
 */
export function ReferentialSelect({
  options,
  value,
  onValueChange,
  placeholder = "Sélectionner…",
  searchTitle,
  allOption,
  id,
  className,
  disabled,
}: ReferentialSelectProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const visible = visibleReferentialOptions(options, [value]);
  const hasMore = options.length > visible.length;

  return (
    <>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          // Radix renvoie "" quand la valeur reçue n'est pas encore parmi
          // ses options (cas d'une valeur trouvée par la recherche) : ce
          // n'est jamais un choix de l'utilisateur, on l'ignore.
          if (!next) return;
          if (next === SEARCH_VALUE) setSearchOpen(true);
          else onValueChange(next);
        }}
      >
        <SelectTrigger id={id} className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allOption && <SelectItem value={allOption.value}>{allOption.label}</SelectItem>}
          {visible.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
          {hasMore && (
            <SelectItem
              value={SEARCH_VALUE}
              className="border-t border-border font-semibold text-navy-mid"
            >
              Rechercher…
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <ReferentialSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title={searchTitle}
        options={options}
        selected={value ? [value] : []}
        onPick={onValueChange}
      />
    </>
  );
}
