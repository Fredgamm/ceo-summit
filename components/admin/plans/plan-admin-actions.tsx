"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { togglePlanActive, deletePlan } from "@/app/actions/admin-plans";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function PlanAdminActions({ planId, isActive }: { planId: string; isActive: boolean }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  async function handleToggleActive() {
    const result = await togglePlanActive(planId, !isActive);
    if (result.success) router.refresh();
  }

  async function handleDelete() {
    const result = await deletePlan(planId);
    if (result.success) {
      router.refresh();
    } else {
      setDeleteError(result.error);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={handleToggleActive}>
        {isActive ? "Désactiver" : "Activer"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
        Supprimer
      </Button>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteError(null);
        }}
        title="Supprimer l'offre"
        description={
          deleteError ?? "Cette action est irréversible si l'offre n'est utilisée par personne."
        }
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
