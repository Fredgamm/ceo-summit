"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { EventStatus } from "@prisma/client";

import { setEventStatus } from "@/app/actions/admin-events";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** E3-T05 — statuts draft → published → cancelled. */
export function EventStatusActions({ eventId, status }: { eventId: string; status: EventStatus }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function apply(next: EventStatus) {
    setError(null);
    setLoading(true);
    try {
      const result = await setEventStatus(eventId, next);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {status !== "PUBLISHED" && (
        <Button
          disabled={loading}
          onClick={() => apply("PUBLISHED")}
          className="w-full justify-center"
        >
          ▶ Publier
        </Button>
      )}
      {status === "PUBLISHED" && (
        <Button
          disabled={loading}
          variant="outline"
          onClick={() => apply("DRAFT")}
          className="w-full justify-center"
        >
          Repasser en brouillon
        </Button>
      )}
      {status !== "CANCELLED" && (
        <Button
          disabled={loading}
          variant="destructive"
          onClick={() => apply("CANCELLED")}
          className="w-full justify-center"
        >
          Annuler l&apos;événement
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
