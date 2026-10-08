"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cancelPendingEvoliaPayment } from "@/app/actions/company-subscription";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { EVOLIA_CANCEL_DELAY_MS } from "@/lib/payment-methods";

/**
 * Paiement carte / Mobile Money en attente chez Evolia : reprendre le
 * paiement, ou (après un délai, le temps qu'une confirmation en route
 * arrive) l'annuler pour choisir un autre mode de paiement.
 */
export function EvoliaPendingPayment({
  paymentId,
  paymentUrl,
  startedAt,
}: {
  paymentId: string;
  paymentUrl: string;
  startedAt: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const canCancel = now != null && now - new Date(startedAt).getTime() >= EVOLIA_CANCEL_DELAY_MS;

  async function handleCancel() {
    const result = await cancelPendingEvoliaPayment(paymentId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Paiement annulé : vous pouvez choisir un autre mode de paiement.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <a href={paymentUrl}>Reprendre le paiement</a>
        </Button>
        {canCancel && (
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
            Changer de mode de paiement
          </Button>
        )}
      </div>
      {!canCancel && (
        <p className="text-xs text-text-muted">
          Si vous venez de payer, la confirmation peut prendre quelques minutes.
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Changer de mode de paiement ?"
        description="Ce paiement par carte ou Mobile Money sera annulé, et vous pourrez en choisir un autre. Si vous avez déjà payé chez Evolia, ne l'annulez pas : la confirmation arrivera d'elle-même."
        confirmLabel="Annuler ce paiement"
        variant="destructive"
        onConfirm={handleCancel}
      />
    </div>
  );
}
