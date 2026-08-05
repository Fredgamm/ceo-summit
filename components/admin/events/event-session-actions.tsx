"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { deleteEventSession } from "@/app/actions/admin-event-sessions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function EventSessionActions({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteEventSession(sessionId);
      if (result.success) router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} disabled={deleting}>
        Supprimer
      </Button>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer cette session"
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
