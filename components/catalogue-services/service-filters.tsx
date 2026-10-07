"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SERVICE_CATEGORIES } from "@/lib/service-categories";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReferentialSelect } from "@/components/referentials/referential-select";

const ALL = "__all__";

/** E5-T01 — filtres catégorie/pays du prestataire. `countries` fourni par la page serveur parente (E8-T11). */
export function ServiceFilters({ countries }: { countries: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Select
        value={searchParams.get("categorie") || ALL}
        onValueChange={(v) => updateParam("categorie", v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Toutes les catégories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toutes les catégories</SelectItem>
          {SERVICE_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ReferentialSelect
        options={countries}
        value={searchParams.get("pays") || ALL}
        onValueChange={(v) => updateParam("pays", v)}
        placeholder="Toutes zones"
        searchTitle="Rechercher un pays"
        allOption={{ value: ALL, label: "Toutes zones" }}
        className="w-[150px]"
      />
    </div>
  );
}
