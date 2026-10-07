"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { resendEvoliaPush } from "@/app/actions/admin-companies";
import { Button } from "@/components/ui/button";

/** Renvoie à Evolia un envoi journalisé (`EvoliaPush`), le même contenu qu'à l'origine. */
export function EvoliaPushResendButton({ pushId }: { pushId: string }) {
  const router = useRouter();
  const [sending, setSending] = React.useState(false);

  async function handleResend() {
    setSending(true);
    try {
      const result = await resendEvoliaPush(pushId);
      if (result.success) toast.success("Envoyé à Evolia.");
      else toast.error(result.error);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleResend} disabled={sending}>
      {sending ? "Envoi…" : "Relancer"}
    </Button>
  );
}
