"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

const TYPES = [
  { value: ALL, label: "Tous" },
  { value: "SUMMIT", label: "Summit" },
  { value: "DINER", label: "Dîners privés" },
  { value: "WEBINAIRE", label: "Webinaires" },
  { value: "RENCONTRE", label: "Rencontres B2B" },
];

const DATES = [
  { value: ALL, label: "Toutes dates" },
  { value: "mois", label: "Ce mois" },
  { value: "trimestre", label: "Prochain trimestre" },
];

const ACCES = [
  { value: ALL, label: "Tous les accès" },
  { value: "MEMBER", label: "Tous membres" },
  { value: "EXECUTIVE", label: "Executive+" },
  { value: "CHAIRMAN", label: "Chairman" },
];

/** E3-T01 — type/date/accès filters drive the URL, same pattern as CatalogueFilters. */
export function EventFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const activeType = searchParams.get("type") ?? ALL;

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => updateParam("type", t.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeType === t.value
                ? "border-navy bg-navy text-white"
                : "border-border bg-white text-text-mid hover:border-navy-light"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={searchParams.get("date") || ALL}
          onValueChange={(v) => updateParam("date", v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATES.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("acces") || ALL}
          onValueChange={(v) => updateParam("acces", v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
