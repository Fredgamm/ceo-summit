"use client";

import * as React from "react";
import { toast } from "sonner";

import { updateDealRoomContactCost } from "@/app/actions/admin-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DealRoomContactCostFormProps {
  cost: number;
}

/**
 * (7 août 2026, demande admin) — le coût en crédits du "Prendre contact"
 * Deal Room était jusqu'ici une constante fixe dans le code
 * (`DEAL_ROOM_CONTACT_COST_DEFAULT`). Mettre à 0 rend le contact gratuit
 * pour tous les membres Member/Executive — les Chairman ne paient de toute
 * façon jamais, quel que soit ce réglage.
 */
export function DealRoomContactCostForm({ cost }: DealRoomContactCostFormProps) {
  const [value, setValue] = React.useState(String(cost));
  const [loading, setLoading] = React.useState(false);

  async function handleSave() {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Coût invalide.");
      return;
    }
    setLoading(true);
    try {
      const result = await updateDealRoomContactCost(parsed);
      if (result.success) {
        toast.success(
          parsed === 0
            ? "Prise de contact Deal Room rendue gratuite pour tous les membres."
            : "Coût du contact Deal Room mis à jour."
        );
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <h3 className="text-sm font-bold text-navy">Coût du contact Deal Room</h3>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Crédits déduits d&apos;un membre Member/Executive pour &quot;Prendre contact&quot; avec
        l&apos;auteur d&apos;une opportunité. Mettre à 0 rend le contact gratuit pour tout le monde.
        Les Chairman ne paient jamais, quel que soit ce réglage.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label
            htmlFor="deal-room-contact-cost"
            className="mb-1.5 block text-sm font-bold text-navy"
          >
            Coût (crédits)
          </Label>
          <Input
            id="deal-room-contact-cost"
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Enregistrement…" : "✓ Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
