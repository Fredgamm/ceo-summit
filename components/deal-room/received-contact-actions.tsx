"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { acceptOpportunityContact, declineOpportunityContact } from "@/app/actions/deal-room";
import { Button } from "@/components/ui/button";

export function ReceivedContactActions({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<"accept" | "decline" | null>(null);

  async function handleAccept() {
    setLoading("accept");
    try {
      const result = await acceptOpportunityContact(contactId);
      if (result.success) router.push(`/messagerie/${result.data.conversationId}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleDecline() {
    setLoading("decline");
    try {
      const result = await declineOpportunityContact(contactId);
      if (result.success) router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={handleAccept} disabled={!!loading}>
        {loading === "accept" ? "…" : "Accepter"}
      </Button>
      <Button size="sm" variant="outline" onClick={handleDecline} disabled={!!loading}>
        {loading === "decline" ? "…" : "Refuser"}
      </Button>
    </div>
  );
}
