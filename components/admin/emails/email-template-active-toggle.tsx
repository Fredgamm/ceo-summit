"use client";

import { useRouter } from "next/navigation";

import { toggleEmailTemplateActive } from "@/app/actions/admin-emails";
import { Button } from "@/components/ui/button";

/** Même pattern que components/admin/plans/plan-admin-actions.tsx::handleToggleActive. */
export function EmailTemplateActiveToggle({
  templateKey,
  isActive,
}: {
  templateKey: string;
  isActive: boolean;
}) {
  const router = useRouter();

  async function handleToggle() {
    const result = await toggleEmailTemplateActive(templateKey, !isActive);
    if (result.success) router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleToggle}>
      {isActive ? "Actif" : "Désactivé — réactiver"}
    </Button>
  );
}
