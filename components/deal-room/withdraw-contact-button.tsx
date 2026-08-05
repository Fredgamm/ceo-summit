"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { withdrawOpportunityContact } from "@/app/actions/deal-room";
import { Button } from "@/components/ui/button";

/**
 * Sprint de correction (5 août 2026, EX-T01) — permet à l'initiateur d'une
 * demande de contact restée sans réponse de la retirer lui-même (crédit
 * remboursé, voir app/actions/deal-room.ts::withdrawOpportunityContact).
 */
export function WithdrawContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleWithdraw() {
    setLoading(true);
    try {
      const result = await withdrawOpportunityContact(contactId);
      if (result.success) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="mt-2 w-full justify-center"
      onClick={handleWithdraw}
      disabled={loading}
    >
      {loading ? "…" : "Retirer ma demande (crédit remboursé)"}
    </Button>
  );
}
