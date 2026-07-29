"use client";

import * as React from "react";
import { toast } from "sonner";

import { sendRenewalReminders } from "@/app/actions/admin-finance";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function RenewalReminderButton({
  withinDays,
  count,
}: {
  withinDays: number;
  count: number;
}) {
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    const result = await sendRenewalReminders(withinDays);
    if (result.success) {
      toast.success(
        `Email de relance envoyé à ${result.data.sent} membre${result.data.sent !== 1 ? "s" : ""}.`
      );
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <Button
        size="sm"
        className="w-full justify-center"
        onClick={() => setOpen(true)}
        disabled={count === 0}
      >
        ✉ Relancer les {count} expiration{count !== 1 ? "s" : ""} imminente{count !== 1 ? "s" : ""}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Relancer les adhésions expirant bientôt"
        description={`Envoyer un email de renouvellement aux ${count} membre${count !== 1 ? "s" : ""} dont l'adhésion expire dans les ${withinDays} prochains jours ?`}
        confirmLabel="✉ Envoyer les relances"
        onConfirm={handleConfirm}
      />
    </>
  );
}
