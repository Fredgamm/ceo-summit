"use client";

import * as React from "react";

import { REFERENTIAL_PRIORITY_COUNT } from "@/lib/referential-options";
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
 * Sélecteur secteur/pays : toute la liste du référentiel.
 * Retour de test du 21 oct. 2026 — n'en montrer que les 10 premières
 * valeurs (suivies de « Rechercher… ») laissait croire que le choix était
 * limité. La recherche reste proposée, en tête, pour une liste longue.
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
  const searchable = options.length > REFERENTIAL_PRIORITY_COUNT;

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
          {searchable && (
            <SelectItem
              value={SEARCH_VALUE}
              className="border-b border-border font-semibold text-navy-mid"
            >
              Rechercher…
            </SelectItem>
          )}
          {allOption && <SelectItem value={allOption.value}>{allOption.label}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
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
