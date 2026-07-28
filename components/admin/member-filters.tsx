"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

const TIERS = [
  { value: "MEMBER", label: "Member" },
  { value: "EXECUTIVE", label: "Executive" },
  { value: "CHAIRMAN", label: "Chairman" },
];

const STATUSES = [
  { value: "ACTIVE", label: "Actif" },
  { value: "PENDING_ACTIVATION", label: "En attente d'activation" },
  { value: "SUSPENDED", label: "Suspendu" },
  { value: "CANCELLED", label: "Exclu" },
  { value: "EXPIRED", label: "Expiré" },
];

/** E8-T04 — dense select-based filters, matching the bo-* admin table aesthetic (vs. the member-facing pill filters). */
export function MemberFilters() {
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

      <Select value={searchParams.get("tier") || ALL} onValueChange={(v) => updateParam("tier", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Tous les tiers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les tiers</SelectItem>
          {TIERS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("pays") || ALL} onValueChange={(v) => updateParam("pays", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Pays" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous pays</SelectItem>
          {COUNTRIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("secteur") || ALL}
        onValueChange={(v) => updateParam("secteur", v)}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Secteur" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous secteurs</SelectItem>
          {SECTORS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
    </div>
  );
}
