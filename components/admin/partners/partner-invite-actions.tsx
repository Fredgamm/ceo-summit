"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { resendPartnerInvite, revokePartnerInvite } from "@/app/actions/admin-partners";
import { Button } from "@/components/ui/button";

/** Module 20 — renvoyer (nouveau lien de 7 jours) ou annuler une invitation partenaire en attente. */
export function PartnerInviteActions({ inviteId, email }: { inviteId: string; email: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<"resend" | "revoke" | null>(null);

  async function resend() {
    setLoading("resend");
    try {
      const result = await resendPartnerInvite(inviteId);
      if (!result.success) toast.error(result.error);
      else if (result.data.warning) toast.warning(result.data.warning);
      else toast.success(`Invitation renvoyée à ${email}.`);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function revoke() {
    if (!confirm(`Annuler l'invitation de ${email} ? Le lien ne fonctionnera plus.`)) return;
    setLoading("revoke");
    try {
      const result = await revokePartnerInvite(inviteId);
      if (!result.success) toast.error(result.error);
      else toast.success("Invitation annulée.");
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={resend} disabled={loading !== null}>
        {loading === "resend" ? "Envoi…" : "Renvoyer"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600"
        onClick={revoke}
        disabled={loading !== null}
      >
        Annuler
      </Button>
    </div>
  );
}
