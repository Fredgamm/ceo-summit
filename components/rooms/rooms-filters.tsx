"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ReferentialSelect } from "@/components/referentials/referential-select";

const ALL = "__all__";

/** E4-T02 — filtre secteur. `sectors` fourni par la page serveur parente (E8-T11). */
export function RoomsFilters({ sectors }: { sectors: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <ReferentialSelect
        options={sectors}
        value={searchParams.get("secteur") || ALL}
        onValueChange={(v) => updateParam("secteur", v)}
        placeholder="Tous les secteurs"
        searchTitle="Rechercher un secteur"
        allOption={{ value: ALL, label: "Tous les secteurs" }}
        className="w-[200px]"
      />
    </div>
  );
}
