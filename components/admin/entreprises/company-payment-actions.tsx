"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { confirmCompanyPayment, rejectCompanyPayment } from "@/app/actions/admin-companies";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function CompanyPaymentActions({
  paymentId,
  companyName,
}: {
  paymentId: string;
  companyName: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    const result = await confirmCompanyPayment(paymentId);
    if (result.success) router.refresh();
  }

  async function handleReject() {
    setError(null);
    const result = await rejectCompanyPayment(paymentId, reason);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setRejecting(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setConfirmOpen(true)}>
          ✓ Valider
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting((v) => !v)}>
          Refuser
        </Button>
      </div>

      {rejecting && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Textarea
            placeholder="Motif du refus (envoyé à l'admin entreprise)"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button size="sm" variant="destructive" onClick={handleReject}>
            Confirmer le refus
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Valider le paiement"
        description={
          <>
            Confirmer la réception du paiement de <strong>{companyName}</strong> ? L&apos;accès sera
            immédiatement accordé à toute l&apos;équipe.
          </>
        }
        confirmLabel="✓ Marquer comme payé"
        onConfirm={handleConfirm}
      />
    </div>
  );
}
