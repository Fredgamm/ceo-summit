"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  approveOpportunity,
  unpublishOpportunity,
  republishOpportunity,
} from "@/app/actions/admin-deal-room";
import { Button } from "@/components/ui/button";

/** E8-T06 — "✓ Valider" directement depuis la carte de file, sans passer par la fiche détail. */
export function QuickApproveButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await approveOpportunity(opportunityId);
      if (result.success) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={loading} className="justify-center">
      {loading ? "…" : "✓ Valider"}
    </Button>
  );
}

/** E8-T06 — "Dépublication opportunités actives" depuis l'onglet Actives. */
export function UnpublishButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await unpublishOpportunity(opportunityId);
      if (result.success) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="destructive" onClick={handleClick} disabled={loading}>
      {loading ? "…" : "Dépublier"}
    </Button>
  );
}

export function RepublishButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await republishOpportunity(opportunityId);
      if (result.success) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={loading}>
      {loading ? "…" : "Republier"}
    </Button>
  );
}
