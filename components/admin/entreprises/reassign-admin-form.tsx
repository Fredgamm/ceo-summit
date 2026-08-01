"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { reassignCompanyAdmin } from "@/app/actions/admin-companies";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ReassignAdminForm({
  companyId,
  members,
  currentAdminId,
}: {
  companyId: string;
  members: { id: string; name: string; email: string }[];
  currentAdminId: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string>("");
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    if (!selected) return;
    const result = await reassignCompanyAdmin(companyId, selected);
    if (result.success) router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Choisir un membre…" />
        </SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id} disabled={m.id === currentAdminId}>
              {m.name} ({m.email}) {m.id === currentAdminId ? "— actuel" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!selected} onClick={() => setOpen(true)}>
        Réassigner
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Réassigner l'admin entreprise"
        description="Le nouveau membre pourra gérer l'abonnement, les invitations et la facturation. L'ancien admin perd ces droits."
        confirmLabel="Confirmer"
        onConfirm={handleConfirm}
      />
    </div>
  );
}
