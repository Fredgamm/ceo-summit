"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

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
  { value: "recent", label: "Trier : Plus récent" },
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

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-navy md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" /> Filtres {open ? "▲" : "▼"}
      </button>

      <div className={cn(open ? "flex" : "hidden md:flex", "flex-wrap gap-3")}>
        <Select
          value={searchParams.get("type") || ALL}
          onValueChange={(v) => updateParam("type", v)}
        >
          <SelectTrigger className="w-[170px]">
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
          className="w-[180px]"
        />

        <ReferentialSelect
          options={countries}
          value={searchParams.get("pays") || ALL}
          onValueChange={(v) => updateParam("pays", v)}
          placeholder="Toutes zones"
          searchTitle="Rechercher un pays"
          allOption={{ value: ALL, label: "Toutes zones" }}
          className="w-[150px]"
        />

        <Select
          value={searchParams.get("budget") || ALL}
          onValueChange={(v) => updateParam("budget", v)}
        >
          <SelectTrigger className="w-[150px]">
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

        <Select
          value={searchParams.get("tri") || "recent"}
          onValueChange={(v) => updateParam("tri", v)}
        >
          <SelectTrigger className="w-[190px]">
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
