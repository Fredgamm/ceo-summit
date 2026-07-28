"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPPORTUNITY_TYPE_LABEL } from "@/components/deal-room/opportunity-card";

const ALL = "__all__";

const TYPES = Object.entries(OPPORTUNITY_TYPE_LABEL);

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

/** E6-T01 — filtres type/secteur/pays/budget + tri. */
export function DealRoomFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL && value !== "recent") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Select value={searchParams.get("type") || ALL} onValueChange={(v) => updateParam("type", v)}>
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Tous les types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les types</SelectItem>
          {TYPES.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("sector") || ALL}
        onValueChange={(v) => updateParam("sector", v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Tous les secteurs" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les secteurs</SelectItem>
          {SECTORS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("pays") || ALL} onValueChange={(v) => updateParam("pays", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Toutes zones" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toutes zones</SelectItem>
          {COUNTRIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
  );
}
