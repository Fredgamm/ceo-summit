"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cancelPendingEvoliaPayment, retryEvoliaPayment } from "@/app/actions/company-subscription";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * Paiement carte / Mobile Money en attente chez Evolia (ou annulé par Evolia) :
 * - reprendre le paiement sur la même page Evolia (`paymentUrl`, absent si le
 *   paiement est déjà annulé) ;
 * - 24 nov. 2026 : recommencer avec une autre carte ou un autre numéro, sous
 *   une nouvelle référence — après une erreur de saisie, la page d'Evolia ne
 *   permet pas toujours de réessayer ;
 * - l'annuler pour choisir un autre mode de paiement (virement, chèque).
 * 21 oct. 2026 — annulation possible tout de suite.
 */
export function EvoliaPendingPayment({
  paymentId,
  paymentUrl,
  startedAt,
}: {
  paymentId: string;
  paymentUrl: string | null;
  startedAt: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"retry" | "cancel" | null>(null);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
  }, []);

  // Paiement lancé il y a peu : la confirmation d'Evolia peut encore arriver.
  const recentlyStarted =
    paymentUrl != null && now != null && now - new Date(startedAt).getTime() < 15 * 60 * 1000;
  // La page de paiement d'Evolia est sur leur domaine (aiolia.us) : on le
  // nomme, pour qu'un client ne s'inquiète pas d'une adresse inattendue.
  const paymentHost = (() => {
    try {
      return paymentUrl ? new URL(paymentUrl).hostname : null;
    } catch {
      return null;
    }
  })();

  async function handleRetry() {
    const result = await retryEvoliaPayment(paymentId);
    if (!result.success) {
      toast.error(result.error);
      router.refresh();
      return;
    }
    if (result.data.redirectUrl) {
      window.location.href = result.data.redirectUrl;
      return;
    }
    router.refresh();
  }

  async function handleCancel() {
    // Déjà annulé chez Evolia : rien à annuler, l'étape Paiement est rouverte.
    if (!paymentUrl) {
      router.push("/entreprise/paiement");
      return;
    }
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
        {paymentUrl && (
          <Button asChild size="sm">
            <a href={paymentUrl}>Reprendre le paiement</a>
          </Button>
        )}
        <Button
          type="button"
          variant={paymentUrl ? "outline" : "default"}
          size="sm"
          onClick={() => setDialog("retry")}
        >
          Réessayer avec une autre carte ou un autre numéro
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => (paymentUrl ? setDialog("cancel") : handleCancel())}
        >
          Payer autrement (virement, chèque)
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
        open={dialog === "retry"}
        onOpenChange={(open) => setDialog(open ? "retry" : null)}
        title="Recommencer le paiement ?"
        description="Une nouvelle page de paiement Evolia va s'ouvrir, où vous pourrez saisir une autre carte ou un autre numéro Mobile Money. Si vous avez déjà été débité, ne recommencez pas : la confirmation arrivera d'elle-même."
        confirmLabel="Recommencer le paiement"
        onConfirm={handleRetry}
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(open) => setDialog(open ? "cancel" : null)}
        title="Changer de mode de paiement ?"
        description="Ce paiement par carte ou Mobile Money sera annulé et vous reviendrez à l'étape Paiement pour en choisir un autre. Si vous avez déjà payé chez Evolia, ne l'annulez pas : la confirmation arrivera d'elle-même."
        confirmLabel="Annuler ce paiement"
        variant="destructive"
        onConfirm={handleCancel}
      />
    </div>
  );
}
