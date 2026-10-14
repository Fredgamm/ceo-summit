"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
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

const CHIP =
  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ON = "border-navy bg-navy text-white";
const CHIP_OFF = "border-border bg-white text-text-mid hover:border-navy-light";

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

  // Sur mobile, la ligne des secteurs défile : on y ramène le secteur choisi,
  // sinon il peut rester caché hors de l'écran (sans faire défiler la page).
  const sectorRowRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const row = sectorRowRef.current;
    const chip = row?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2 });
  }, [activeSector]);

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
      <div className="relative sm:max-w-[360px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          type="search"
          placeholder="Nom, entreprise, secteur…"
          aria-label="Rechercher un membre"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div
        ref={sectorRowRef}
        role="group"
        aria-label="Secteur"
        className={cn(
          "relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[mask-image:linear-gradient(to_right,#000_88%,transparent)]",
          "sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]"
        )}
      >
        <button
          type="button"
          aria-pressed={!activeSector}
          onClick={() => updateParam("secteur", "")}
          className={cn(CHIP, !activeSector ? CHIP_ON : CHIP_OFF)}
        >
          Tous les secteurs
        </button>
        {visibleReferentialOptions(sectors, [activeSector]).map((sector) => (
          <button
            key={sector}
            type="button"
            aria-pressed={activeSector === sector}
            onClick={() => updateParam("secteur", sector)}
            className={cn(CHIP, activeSector === sector ? CHIP_ON : CHIP_OFF)}
          >
            {sector}
          </button>
        ))}
        <ReferentialSearchButton
          options={sectors}
          title="Rechercher un secteur"
          selected={activeSector ? [activeSector] : []}
          onPick={(sector) => updateParam("secteur", sector)}
          className={cn(
            CHIP,
            "border-dashed border-border bg-white text-navy-mid hover:border-navy-light"
          )}
        />
      </div>

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
