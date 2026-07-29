"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { confirmEventPayment, sendEventPaymentReminder } from "@/app/actions/admin-finance";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function EventPaymentActions({
  registrationId,
  memberName,
}: {
  registrationId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [reminding, setReminding] = React.useState(false);

  async function handleConfirm() {
    const result = await confirmEventPayment(registrationId);
    if (result.success) router.refresh();
    else toast.error(result.error);
  }

  async function handleRemind() {
    setReminding(true);
    try {
      const result = await sendEventPaymentReminder(registrationId);
      if (result.success) toast.success(`Email de relance envoyé à ${memberName}.`);
      else toast.error(result.error);
    } finally {
      setReminding(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => setConfirmOpen(true)}>
        ✓ Valider
      </Button>
      <Button size="sm" variant="ghost" onClick={handleRemind} disabled={reminding}>
        {reminding ? "…" : "✉ Relancer"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Valider le paiement"
        description={
          <>
            Confirmer la réception du paiement de <strong>{memberName}</strong> ? L&apos;accès lui
            sera immédiatement accordé.
          </>
        }
        confirmLabel="✓ Marquer comme payé"
        onConfirm={handleConfirm}
      />
    </div>
  );
}
