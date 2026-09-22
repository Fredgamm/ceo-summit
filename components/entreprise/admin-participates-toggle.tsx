"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { setAdminParticipates } from "@/app/actions/company-invites";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * 22 septembre 2026 (`conception/12` §3.3) — le gestionnaire qui inscrit
 * l'entreprise et paie n'assiste pas forcément lui-même à l'évènement.
 * Cette case décide s'il consomme une place parmi celles de l'offre.
 */
export function AdminParticipatesToggle({
  companyId,
  participates,
}: {
  companyId: string;
  participates: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function toggle(checked: boolean) {
    setPending(true);
    try {
      const result = await setAdminParticipates(companyId, checked);
      if (result.success) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm text-text-mid">
      <Checkbox
        checked={participates}
        disabled={pending}
        onCheckedChange={(c) => toggle(c === true)}
      />
      Je participe moi-même à l&apos;évènement
    </label>
  );
}
