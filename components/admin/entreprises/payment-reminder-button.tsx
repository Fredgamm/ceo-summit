"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { sendCompanyPaymentReminder } from "@/app/actions/admin-companies";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** 29 oct. 2026 — relance de l'admin d'une entreprise en attente de paiement. */
export function PaymentReminderButton({
  companyId,
  companyName,
  adminName,
  adminEmail,
  compact = false,
}: {
  companyId: string;
  companyName: string;
  adminName: string;
  adminEmail: string;
  /** Libellé court, pour une ligne de tableau (liste des entreprises). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    const result = await sendCompanyPaymentReminder(companyId);
    if (result.success) {
      toast.success(`E-mail de relance envoyé à ${adminName}.`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <Button size="sm" variant={compact ? "ghost" : "outline"} onClick={() => setOpen(true)}>
        {compact ? "✉ Relancer" : "✉ Relancer pour le paiement"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Relancer pour le paiement"
        description={
          <>
            Envoyer à <strong>{adminName}</strong> ({adminEmail}) un e-mail l&apos;invitant à
            finaliser le paiement de <strong>{companyName}</strong> ? Le lien mène à l&apos;étape de
            paiement, quel que soit le mode choisi.
          </>
        }
        confirmLabel="✉ Envoyer la relance"
        onConfirm={handleConfirm}
      />
    </>
  );
}
