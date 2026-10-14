"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchField } from "@/components/ui/search-field";
import { FILTER_CHIP_CLASS, FilterChipRow } from "@/components/ui/filter-chip-row";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ReferentialSelect } from "@/components/referentials/referential-select";
import { ReferentialSearchButton } from "@/components/referentials/referential-search-button";
import { visibleReferentialOptions } from "@/lib/referential-options";

const ALL = "__all__";

// `short` : libellé affiché dans le menu fermé, qui doit tenir sur une ligne
// à côté du filtre pays sur mobile (14 oct. 2026) ; `label` dans la liste.
const SORTS = [
  { value: "offre", short: "Offre", label: "Offre (plus chère d'abord)" },
  { value: "recent", short: "Récents", label: "Activité récente" },
  { value: "alpha", short: "A → Z", label: "Alphabétique" },
];

/**
 * E2-T03 — filters/sort/search drive the URL's query string (server
 * component re-fetches on navigation) rather than client-side state, so
 * the catalogue stays a plain server-rendered page with no client data cache.
 */
export function CatalogueFilters({
  sectors,
  countries,
}: {
  sectors: string[];
  countries: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = React.useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page"); // any filter change resets pagination
    router.push(`${pathname}?${params.toString()}`);
  }

  React.useEffect(() => {
    const currentQ = searchParams.get("q") ?? "";
    if (q === currentQ) return;
    const handle = setTimeout(() => updateParam("q", q), 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeSector = searchParams.get("secteur") ?? "";
  const activeCountry = searchParams.get("pays") ?? "";
  const activeSort = searchParams.get("tri") || "offre";
  const hasFilters = Boolean(activeSector || activeCountry || searchParams.get("q"));

  function clearFilters() {
    setQ("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["secteur", "pays", "q", "page"]) params.delete(key);
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    // 14 oct. 2026 — mobile : secteurs sur une seule ligne qui défile (ils
    // occupaient six lignes), pays et tri côte à côte à largeur égale.
    <div className="mb-5 flex flex-col gap-3">
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="Nom, entreprise, secteur…"
        label="Rechercher un membre"
        className="sm:max-w-[360px]"
      />

      <FilterChipRow
        label="Secteur"
        allLabel="Tous les secteurs"
        options={visibleReferentialOptions(sectors, [activeSector])}
        value={activeSector}
        onChange={(sector) => updateParam("secteur", sector)}
        trailing={
          <ReferentialSearchButton
            options={sectors}
            title="Rechercher un secteur"
            selected={activeSector ? [activeSector] : []}
            onPick={(sector) => updateParam("secteur", sector)}
            className={cn(
              FILTER_CHIP_CLASS,
              "border-dashed border-border bg-white text-navy-mid hover:border-navy-light"
            )}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <ReferentialSelect
          options={countries}
          value={activeCountry || ALL}
          onValueChange={(v) => updateParam("pays", v === ALL ? "" : v)}
          placeholder="Tous pays"
          searchTitle="Rechercher un pays"
          allOption={{ value: ALL, label: "Tous pays" }}
          className="w-full sm:w-[180px]"
        />

        <Select value={activeSort} onValueChange={(v) => updateParam("tri", v)}>
          <SelectTrigger className="w-full sm:w-[200px]" aria-label="Trier les membres">
            <span className="truncate">
              <span className="text-text-muted">Tri : </span>
              {SORTS.find((s) => s.value === activeSort)?.short ?? "Offre"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="col-span-2 justify-self-start text-sm font-medium text-navy-mid underline-offset-4 hover:underline sm:col-span-1"
          >
            Effacer les filtres
          </button>
        )}
      </div>
    </div>
  );
}
