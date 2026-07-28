"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { RoomStatus } from "@prisma/client";

import { archiveRoom, restoreRoom } from "@/app/actions/admin-rooms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function RoomAdminActions({ roomId, status }: { roomId: string; status: RoomStatus }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    const result = status === "ACTIVE" ? await archiveRoom(roomId) : await restoreRoom(roomId);
    if (result.success) router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {status === "ACTIVE" ? "Archiver" : "Restaurer"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={status === "ACTIVE" ? "Archiver la salle" : "Restaurer la salle"}
        description={
          status === "ACTIVE"
            ? "Les membres n'y auront plus accès mais l'historique sera conservé."
            : "Rendre à nouveau la salle accessible aux membres ?"
        }
        confirmLabel={status === "ACTIVE" ? "Archiver" : "Restaurer"}
        variant={status === "ACTIVE" ? "destructive" : "default"}
        onConfirm={handleConfirm}
      />
    </>
  );
}
