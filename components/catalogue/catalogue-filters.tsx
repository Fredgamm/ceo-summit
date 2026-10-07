"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ReferentialSelect } from "@/components/referentials/referential-select";
import { ReferentialSearchButton } from "@/components/referentials/referential-search-button";
import { visibleReferentialOptions } from "@/lib/referential-options";

const ALL = "__all__";

const SORTS = [
  { value: "offre", label: "Trier : Offre (plus chère d'abord)" },
  { value: "recent", label: "Activité récente" },
  { value: "alpha", label: "Alphabétique" },
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

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="relative max-w-[360px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="Nom, entreprise, secteur…"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateParam("secteur", "")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            !activeSector
              ? "border-navy bg-navy text-white"
              : "border-border bg-white text-text-mid hover:border-navy-light"
          )}
        >
          Tous
        </button>
        {visibleReferentialOptions(sectors, [activeSector]).map((sector) => (
          <button
            key={sector}
            type="button"
            onClick={() => updateParam("secteur", sector)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeSector === sector
                ? "border-navy bg-navy text-white"
                : "border-border bg-white text-text-mid hover:border-navy-light"
            )}
          >
            {sector}
          </button>
        ))}
        <ReferentialSearchButton
          options={sectors}
          title="Rechercher un secteur"
          selected={activeSector ? [activeSector] : []}
          onPick={(sector) => updateParam("secteur", sector)}
          className="rounded-full border border-dashed border-border bg-white px-3 py-1 text-xs font-medium text-navy-mid transition-colors hover:border-navy-light"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <ReferentialSelect
          options={countries}
          value={searchParams.get("pays") || ALL}
          onValueChange={(v) => updateParam("pays", v === ALL ? "" : v)}
          placeholder="Tous pays"
          searchTitle="Rechercher un pays"
          allOption={{ value: ALL, label: "Tous pays" }}
          className="w-[160px]"
        />

        <Select
          value={searchParams.get("tri") || "offre"}
          onValueChange={(v) => updateParam("tri", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
