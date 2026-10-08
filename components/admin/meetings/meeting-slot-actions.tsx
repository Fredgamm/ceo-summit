"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { deleteMeetingSlot, setMeetingSlotDisabled } from "@/app/actions/admin-meetings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

/**
 * Module 21 lot 2 — désactiver / réactiver / supprimer un créneau. La
 * désactivation d'un créneau qui porte des demandes ou des rendez-vous
 * demande une confirmation explicite de leur annulation (RG-12).
 */
export function MeetingSlotActions({
  slotId,
  disabled,
  canDelete,
  readOnly,
}: {
  slotId: string;
  disabled: boolean;
  canDelete: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cancelCount, setCancelCount] = React.useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  async function toggle(confirmCancel = false) {
    setError(null);
    setBusy(true);
    try {
      const result = await setMeetingSlotDisabled(slotId, !disabled, { confirmCancel });
      if (!result.success) {
        if ("activeBookings" in result) {
          setCancelCount(result.activeBookings);
          return;
        }
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const result = await deleteMeetingSlot(slotId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (readOnly) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => toggle()}>
          {disabled ? "Réactiver" : "Désactiver"}
        </Button>
        {canDelete && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleteOpen(true)}>
            Supprimer
          </Button>
        )}
      </div>
      {error && <p className="max-w-xs text-right text-xs text-red-700">{error}</p>}

      <ConfirmDialog
        open={cancelCount !== null}
        onOpenChange={(open) => !open && setCancelCount(null)}
        title="Désactiver ce créneau"
        description={`Ce créneau porte ${cancelCount ?? 0} demande(s) ou rendez-vous. Ils seront annulés et les participants concernés devront être prévenus.`}
        confirmLabel="Annuler et désactiver"
        variant="destructive"
        onConfirm={() => toggle(true)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer ce créneau"
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
}
