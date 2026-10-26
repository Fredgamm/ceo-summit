"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { designateStaffOrganization } from "@/app/actions/admin-settings";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pluralize } from "@/lib/utils";

/**
 * 26 oct. 2026 — organisation unique du staff CEO Summit
 * (lib/staff-organization.ts) : lien vers sa gestion, ou désignation si la
 * migration n'a trouvé aucune organisation à désigner.
 */
export function StaffOrganizationCard({
  staff,
  companies,
}: {
  staff: { id: string; name: string; memberCount: number } | null;
  /** Organisations proposées à la désignation (seulement sans organisation staff). */
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleDesignate() {
    if (!companyId) return;
    setSaving(true);
    try {
      const result = await designateStaffOrganization(companyId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Organisation du staff désignée.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-5">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-navy">
          Organisation du staff{staff && ` : ${staff.name}`}
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          {staff
            ? `${pluralize(staff.memberCount, "membre")}. Chaque administrateur y est rattaché, et tout super admin peut y inviter de nouveaux membres.`
            : "Aucune organisation désignée : choisissez Becom, qui regroupe le staff."}
        </p>
      </div>
      {staff ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/entreprises/${staff.id}?tab=gestion`}>Gérer l&apos;équipe →</Link>
        </Button>
      ) : (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Organisation du staff">
              <SelectValue placeholder="Choisir une organisation" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleDesignate} disabled={!companyId || saving}>
            {saving ? "Enregistrement…" : "Désigner"}
          </Button>
        </div>
      )}
    </div>
  );
}
