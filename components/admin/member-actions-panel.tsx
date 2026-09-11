"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { MembershipStatus } from "@prisma/client";

import { suspendMember, excludeMember, reactivateMember } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MemberActionsPanelProps {
  userId: string;
  status: MembershipStatus;
}

/**
 * E8-T04 — suspendre / exclure / réactiver.
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — "Changer le tier"
 * retiré : le tier vient du rang de l'offre plateforme de l'entreprise,
 * plus un attribut personnel modifiable ici (voir app/actions/members.ts).
 * "Attribuer des crédits" retiré (sept. 2026) — le système de crédits Deal
 * Room n'est plus consommé nulle part (voir lib/deal-room-settings.ts),
 * attribuer un solde qui ne sert plus à rien n'a plus de sens.
 */
export function MemberActionsPanel({ userId, status }: MemberActionsPanelProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<string | null>(null);

  async function run(key: string, action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    setLoading(key);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-white p-5">
        <p className="mb-3 text-sm font-bold text-navy">Statut du compte</p>
        <div className="flex flex-col gap-2">
          {status !== "SUSPENDED" && (
            <Button
              variant="outline"
              size="sm"
              disabled={!!loading}
              onClick={() => run("suspend", () => suspendMember(userId))}
            >
              Suspendre
            </Button>
          )}
          {status !== "CANCELLED" && (
            <Button
              variant="destructive"
              size="sm"
              disabled={!!loading}
              onClick={() => run("exclude", () => excludeMember(userId))}
            >
              Exclure
            </Button>
          )}
          {(status === "SUSPENDED" || status === "CANCELLED") && (
            <Button
              size="sm"
              disabled={!!loading}
              onClick={() => run("reactivate", () => reactivateMember(userId))}
            >
              Réactiver
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
