"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { publishMeetingSlots } from "@/app/actions/admin-meetings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** Module 21 lot 2 — publication des créneaux en brouillon. */
export function MeetingPublishButton({
  eventId,
  draftCount,
  alreadyPublished,
}: {
  eventId: string;
  draftCount: number;
  alreadyPublished: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function publish() {
    setError(null);
    setBusy(true);
    try {
      const result = await publishMeetingSlots(eventId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (alreadyPublished && draftCount === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={busy || draftCount === 0} onClick={() => setOpen(true)}>
        ▶ Publier {draftCount} créneau(x)
      </Button>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Publier les créneaux"
        description="Les participants de l'événement verront ces créneaux dans « Mes créneaux », inactifs tant qu'ils ne les activent pas. Les demandes de rendez-vous seront possibles jusqu'à la fin de l'événement."
        confirmLabel="Publier"
        onConfirm={publish}
      />
    </div>
  );
}
