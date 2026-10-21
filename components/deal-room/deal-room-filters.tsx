"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ReferentialSelect } from "@/components/referentials/referential-select";

const ALL = "__all__";

const BUDGETS = [
  { value: ALL, label: "Budget : tous" },
  { value: "lt50m", label: "< 50M Ar" },
  { value: "50-200m", label: "50–200M Ar" },
  { value: "gt200m", label: "> 200M Ar" },
];

const SORTS = [
  { value: "recent", label: "Plus récent" },
  { value: "budget_asc", label: "Budget croissant" },
  { value: "budget_desc", label: "Budget décroissant" },
  { value: "deadline", label: "Date limite" },
];

interface DealRoomFiltersProps {
  types: string[];
  sectors: string[];
  countries: string[];
}

/**
 * E6-T01 — filtres type/secteur/pays/budget + tri.
 * `types`/`sectors`/`countries` (référentiels admin-éditables depuis le 5
 * août 2026, E8-T11) viennent du Server Component parent (`/deal-room`) —
 * ce composant client ne peut pas les lire lui-même.
 */
export function DealRoomFilters({ types, sectors, countries }: DealRoomFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL && value !== "recent") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const FILTER_KEYS = ["type", "sector", "pays", "budget"];
  const activeCount = FILTER_KEYS.filter((key) => searchParams.get(key)).length;

  function resetFilters() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of [...FILTER_KEYS, "page"]) params.delete(key);
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  const sortSelect = (
    <Select
      value={searchParams.get("tri") || "recent"}
      onValueChange={(v) => updateParam("tri", v)}
    >
      <SelectTrigger className="h-9 w-auto gap-1.5 rounded-full border-border bg-white px-3.5 text-sm md:h-10 md:w-[190px] md:rounded-md">
        <span className="text-text-muted">Trier :</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORTS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    // Refonte mobile (21 oct. 2026) : bouton « Filtres » avec le nombre de
    // filtres actifs et tri côte à côte ; filtres ouverts en grille 2 colonnes
    // de largeur égale (au lieu de listes de largeurs fixes qui s'empilaient
    // en escalier). Inchangé à partir de md.
    <div className="mb-4">
      <div className="mb-3 flex items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors",
            open || activeCount > 0
              ? "border-navy bg-navy text-white"
              : "border-border bg-white text-navy"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtres
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-xs text-navy-dark">
              {activeCount}
            </span>
          )}
        </button>
        {sortSelect}
      </div>

      <div
        className={cn(
          open ? "grid" : "hidden md:flex",
          "grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3"
        )}
      >
        <Select
          value={searchParams.get("type") || ALL}
          onValueChange={(v) => updateParam("type", v)}
        >
          <SelectTrigger className="col-span-2 w-full bg-white md:w-[170px]">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ReferentialSelect
          options={sectors}
          value={searchParams.get("sector") || ALL}
          onValueChange={(v) => updateParam("sector", v)}
          placeholder="Tous les secteurs"
          searchTitle="Rechercher un secteur"
          allOption={{ value: ALL, label: "Tous les secteurs" }}
          className="w-full bg-white md:w-[180px]"
        />

        <ReferentialSelect
          options={countries}
          value={searchParams.get("pays") || ALL}
          onValueChange={(v) => updateParam("pays", v)}
          placeholder="Toutes zones"
          searchTitle="Rechercher un pays"
          allOption={{ value: ALL, label: "Toutes zones" }}
          className="w-full bg-white md:w-[150px]"
        />

        <Select
          value={searchParams.get("budget") || ALL}
          onValueChange={(v) => updateParam("budget", v)}
        >
          <SelectTrigger className="col-span-2 w-full bg-white md:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUDGETS.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="hidden md:block">{sortSelect}</div>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="col-span-2 inline-flex items-center justify-center gap-1 py-1.5 text-sm font-semibold text-navy-mid md:col-span-1"
          >
            <X className="h-3.5 w-3.5" /> Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
}
