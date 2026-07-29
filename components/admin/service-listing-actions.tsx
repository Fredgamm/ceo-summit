"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { approveServiceListing, rejectServiceListing } from "@/app/actions/admin-services";
import { Button } from "@/components/ui/button";

export function ServiceListingActions({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<"approve" | "reject" | null>(null);

  async function run(action: "approve" | "reject") {
    setLoading(action);
    try {
      const result =
        action === "approve"
          ? await approveServiceListing(listingId)
          : await rejectServiceListing(listingId);
      if (result.success) router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={!!loading} onClick={() => run("approve")}>
        {loading === "approve" ? "…" : "Publier"}
      </Button>
      <Button size="sm" variant="destructive" disabled={!!loading} onClick={() => run("reject")}>
        {loading === "reject" ? "…" : "Refuser"}
      </Button>
    </div>
  );
}
