"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReferentialSelect } from "@/components/referentials/referential-select";

const ALL = "__all__";

const STATUSES = [
  { value: "ACTIVE", label: "Actif" },
  { value: "PENDING_ACTIVATION", label: "En attente d'activation" },
  { value: "SUSPENDED", label: "Suspendu" },
  { value: "CANCELLED", label: "Exclu" },
  { value: "EXPIRED", label: "Expiré" },
];

/**
 * E8-T04 — dense select-based filters, matching the bo-* admin table
 * aesthetic (vs. the member-facing pill filters). `sectors`/`countries`
 * (E8-T11, 5 août 2026) fournis par la page serveur parente.
 */
export function MemberFilters({ sectors, countries }: { sectors: string[]; countries: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = React.useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  React.useEffect(() => {
    const currentQ = searchParams.get("q") ?? "";
    if (q === currentQ) return;
    const handle = setTimeout(() => updateParam("q", q), 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Nom, entreprise, email…"
        className="w-[220px]"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <ReferentialSelect
        options={countries}
        value={searchParams.get("pays") || ALL}
        onValueChange={(v) => updateParam("pays", v)}
        placeholder="Pays"
        searchTitle="Rechercher un pays"
        allOption={{ value: ALL, label: "Tous pays" }}
        className="w-[150px]"
      />

      <ReferentialSelect
        options={sectors}
        value={searchParams.get("secteur") || ALL}
        onValueChange={(v) => updateParam("secteur", v)}
        placeholder="Secteur"
        searchTitle="Rechercher un secteur"
        allOption={{ value: ALL, label: "Tous secteurs" }}
        className="w-[170px]"
      />

      <Select
        value={searchParams.get("statut") || ALL}
        onValueChange={(v) => updateParam("statut", v)}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous statuts</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 23 oct. 2026 — staff CEO Summit / BECOM masqué par défaut. */}
      <Select
        value={searchParams.get("staff") === "1" ? "1" : ALL}
        onValueChange={(v) => updateParam("staff", v)}
      >
        <SelectTrigger className="w-[170px]" aria-label="Staff">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Sans le staff</SelectItem>
          <SelectItem value="1">Avec le staff</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
