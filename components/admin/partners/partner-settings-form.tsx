"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updatePartnerSettings } from "@/app/actions/admin-partners";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Module 20 — nombre de membres et contrepartie d'une entreprise partenaire, sur sa fiche admin. */
export function PartnerSettingsForm({
  companyId,
  memberLimit,
  counterpart,
}: {
  companyId: string;
  memberLimit: number;
  counterpart: string;
}) {
  const router = useRouter();
  const [members, setMembers] = React.useState(String(memberLimit));
  const [text, setText] = React.useState(counterpart);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await updatePartnerSettings(companyId, {
        memberLimit: members,
        counterpart: text,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Réglages du partenaire enregistrés.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex max-w-[220px] flex-col gap-1.5">
        <Label htmlFor="partner-settings-members">Nombre de membres</Label>
        <Input
          id="partner-settings-members"
          type="number"
          min={1}
          value={members}
          onChange={(e) => setMembers(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partner-settings-counterpart">Contrepartie</Label>
        <Textarea
          id="partner-settings-counterpart"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
