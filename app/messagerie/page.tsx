import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { startConversation } from "@/app/actions/messages";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * E7-T02 — "Initiation depuis profil membre / fiche Deal Room / catalogue" :
 * every entry point links here with `?new=<userId>` (optionally
 * `&opportunity=<id>`), and this page does the find-or-create + redirect so
 * none of those pages need their own conversation-creation logic.
 */
export default async function MessageriePage({
  searchParams,
}: {
  searchParams: { new?: string; opportunity?: string };
}) {
  if (searchParams.new) {
    const result = await startConversation(searchParams.new, searchParams.opportunity);
    if (result.success) redirect(`/messagerie/${result.data.id}`);
  }

  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={MessageCircle}
        title="Sélectionnez une conversation"
        description="Choisissez un échange dans la liste pour l'afficher ici."
      />
    </div>
  );
}
