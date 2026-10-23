"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateShowStaffInDirectory } from "@/app/actions/admin-directory";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

/**
 * 23 oct. 2026 — le staff (équipes CEO Summit et BECOM) dans l'annuaire des
 * membres et les « Nouveaux membres ». Voir lib/staff-visibility.ts.
 */
export function DirectorySettings({
  showStaff,
  staffCount,
}: {
  showStaff: boolean;
  staffCount: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      const result = await updateShowStaffInDirectory(next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next ? "Le staff apparaît dans l'annuaire." : "Le staff est masqué de l'annuaire."
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">Annuaire des membres</h3>
        <Badge variant={showStaff ? "active" : "draft"}>
          {showStaff ? "Staff affiché" : "Staff masqué"}
        </Badge>
      </div>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Les comptes administrateurs de la plateforme (équipes CEO Summit et BECOM, {staffCount} au
        total) peuvent être retirés de l&apos;annuaire et des « Nouveaux membres » du tableau de
        bord.
      </p>
      <div className="flex items-center gap-2.5">
        <input
          id="directory-show-staff"
          type="checkbox"
          className="h-4 w-4 accent-navy"
          checked={showStaff}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
        />
        <Label htmlFor="directory-show-staff" className="cursor-pointer">
          Afficher le staff dans l&apos;annuaire des membres
        </Label>
      </div>
    </div>
  );
}
