"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { savePreregisteredParticipants } from "@/app/actions/company-subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 23 oct. 2026 — préinscription d'une offre groupement : nombre de
 * participants prévus, repris au paiement.
 */
export function PreregistrationParticipants({
  companySubscriptionId,
  minParticipants,
  initialCount,
}: {
  companySubscriptionId: string;
  minParticipants: number | null;
  initialCount: number | null;
}) {
  const router = useRouter();
  const min = minParticipants ?? 1;
  const [value, setValue] = React.useState(String(initialCount ?? min));
  const [saving, setSaving] = React.useState(false);
  const count = value === "" ? 0 : parseInt(value, 10);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await savePreregisteredParticipants(companySubscriptionId, count);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Nombre de participants enregistré.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <Label htmlFor="prereg-participants">Nombre de participants prévus</Label>
      <div className="flex gap-2">
        <Input
          id="prereg-participants"
          type="number"
          inputMode="numeric"
          min={min}
          step={1}
          className="max-w-[140px]"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={saving || count < min || count === initialCount}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        Vous pourrez encore le modifier au moment du paiement, et désignerez les participants
        ensuite.
      </p>
    </form>
  );
}
