"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cancelPendingEvoliaPayment } from "@/app/actions/company-subscription";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * Paiement carte / Mobile Money en attente chez Evolia : reprendre le
 * paiement, ou l'annuler pour choisir un autre mode de paiement.
 * 21 oct. 2026 — annulation possible tout de suite (elle n'apparaissait
 * qu'après 15 minutes : un client revenu d'une annulation chez Evolia
 * restait bloqué sur cet écran).
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
  }, []);

  // Paiement lancé il y a peu : la confirmation d'Evolia peut encore arriver.
  const recentlyStarted = now != null && now - new Date(startedAt).getTime() < 15 * 60 * 1000;
  // La page de paiement d'Evolia est sur leur domaine (aiolia.us) : on le
  // nomme, pour qu'un client ne s'inquiète pas d'une adresse inattendue.
  const paymentHost = (() => {
    try {
      return new URL(paymentUrl).hostname;
    } catch {
      return null;
    }
  })();

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
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          Changer de mode de paiement
        </Button>
      </div>
      {paymentHost && (
        <p className="text-xs text-text-muted">
          Paiement sécurisé par Evolia, sur leur site {paymentHost}.
        </p>
      )}
      {recentlyStarted && (
        <p className="text-xs text-text-muted">
          Si vous venez de payer, la confirmation peut prendre quelques minutes.
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Changer de mode de paiement ?"
        description="Ce paiement par carte ou Mobile Money sera annulé et vous reviendrez à l'étape Paiement pour en choisir un autre. Si vous avez déjà payé chez Evolia, ne l'annulez pas : la confirmation arrivera d'elle-même."
        confirmLabel="Annuler ce paiement"
        variant="destructive"
        onConfirm={handleCancel}
      />
    </div>
  );
}
