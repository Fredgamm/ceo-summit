"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FilterChipRow } from "@/components/ui/filter-chip-row";
import { SearchField } from "@/components/ui/search-field";

/**
 * E4-T02 — filtres des salles. 14 oct. 2026 : recherche par nom et puces de
 * secteur sur une ligne qui défile (modèle des grands catalogues mobiles), au
 * lieu d'un seul menu déroulant. `sectors` : secteurs ayant au moins une salle.
 */
export function RoomsFilters({ sectors }: { sectors: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  React.useEffect(() => {
    if (q === (searchParams.get("q") ?? "")) return;
    const handle = setTimeout(() => updateParam("q", q.trim()), 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-5 flex flex-col gap-3">
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="Rechercher une salle…"
        label="Rechercher une salle"
        className="sm:max-w-[360px]"
      />
      {sectors.length > 1 && (
        <FilterChipRow
          label="Secteur"
          allLabel="Toutes les salles"
          options={sectors}
          value={searchParams.get("secteur") ?? ""}
          onChange={(sector) => updateParam("secteur", sector)}
        />
      )}
    </div>
  );
}
