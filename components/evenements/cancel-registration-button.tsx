"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cancelEventRegistration } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** Sprint de correction (5 août 2026, EX-T01) — annulation d'inscription côté membre. */
export function CancelRegistrationButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const result = await cancelEventRegistration(eventId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        className="mt-2 w-full justify-center text-red-600"
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        Annuler mon inscription
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title="Annuler mon inscription"
        description={
          error ??
          "Vous pourrez vous réinscrire tant qu'il reste des places. Un paiement déjà effectué n'est pas remboursé automatiquement — contactez l'équipe CEO Summit."
        }
        confirmLabel="Annuler l'inscription"
        variant="destructive"
        onConfirm={handleConfirm}
      />
    </>
  );
}
