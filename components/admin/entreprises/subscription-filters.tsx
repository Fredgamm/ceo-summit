"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

/**
 * 24 nov. 2026 — filtres du tableau « Abonnements » (/admin/entreprises),
 * portés par l'adresse (partageable, conservée au retour d'une fiche).
 */
export function SubscriptionFilters({
  statuses,
  plans,
}: {
  statuses: { value: string; label: string }[];
  plans: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = React.useState(searchParams.get("q") ?? "");
  // « Effacer les filtres » vide aussi la recherche : pas de relance différée.
  const clearing = React.useRef(false);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  React.useEffect(() => {
    if (clearing.current) {
      clearing.current = false;
      return;
    }
    const currentQ = searchParams.get("q") ?? "";
    if (q === currentQ) return;
    const handle = setTimeout(() => updateParam("q", q), 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = ["q", "statut", "offre"].some((key) => searchParams.get(key));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Entreprise, gérant, e-mail…"
        aria-label="Rechercher une entreprise"
        className="w-full sm:w-[240px]"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <Select
        value={searchParams.get("statut") || ALL}
        onValueChange={(v) => updateParam("statut", v)}
      >
        <SelectTrigger className="w-[200px]" aria-label="Statut">
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous statuts</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("offre") || ALL}
        onValueChange={(v) => updateParam("offre", v)}
      >
        <SelectTrigger className="w-[220px]" aria-label="Offre">
          <SelectValue placeholder="Offre" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toutes offres</SelectItem>
          {plans.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            // Sans recherche en cours, setQ("") ne relance pas l'effet.
            clearing.current = q !== "";
            setQ("");
            router.push(pathname, { scroll: false });
          }}
        >
          Effacer les filtres
        </Button>
      )}
    </div>
  );
}
