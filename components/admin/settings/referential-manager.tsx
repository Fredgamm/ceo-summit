"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createReferentialItem, deleteReferentialItem } from "@/app/actions/admin-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReferentialType = "sector" | "country" | "opportunity_type";

interface ReferentialManagerProps {
  type: ReferentialType;
  title: string;
  items: { id: string; label: string }[];
}

/**
 * E8-T11 — CRUD sur le référentiel réel (`Referential`, existait mais
 * n'était consommé par aucune page). Les listes membre-facing (secteurs,
 * pays dans les filtres candidature/deal room) restent sur leurs tableaux
 * statiques `lib/sectors.ts` / `lib/countries.ts` pour l'instant — les
 * migrer vers cette source est une dette technique séparée, plus large que
 * ce ticket.
 */
export function ReferentialManager({ type, title, items }: ReferentialManagerProps) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function handleAdd() {
    if (!label.trim()) return;
    setAdding(true);
    try {
      const result = await createReferentialItem(type, label);
      if (result.success) {
        setLabel("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const result = await deleteReferentialItem(id);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}</h3>
      <div className="mb-3 flex flex-col gap-1.5">
        {items.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun élément.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm text-text-mid"
            >
              {item.label}
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Nouveau libellé…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={adding || !label.trim()} size="sm">
          + Ajouter
        </Button>
      </div>
    </div>
  );
}
