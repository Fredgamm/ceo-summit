"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { confirmCreditPurchase, rejectCreditPurchase } from "@/app/actions/credits";
import { Button } from "@/components/ui/button";

export function CreditPurchaseActions({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<"confirm" | "reject" | null>(null);

  async function run(action: "confirm" | "reject") {
    setLoading(action);
    try {
      const result =
        action === "confirm"
          ? await confirmCreditPurchase(purchaseId)
          : await rejectCreditPurchase(purchaseId);
      if (result.success) router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={!!loading} onClick={() => run("confirm")}>
        {loading === "confirm" ? "…" : "Confirmer"}
      </Button>
      <Button size="sm" variant="destructive" disabled={!!loading} onClick={() => run("reject")}>
        {loading === "reject" ? "…" : "Refuser"}
      </Button>
    </div>
  );
}
