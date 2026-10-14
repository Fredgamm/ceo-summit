import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { startConversation } from "@/app/actions/messages";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Les liens "Envoyer un message" pointent ici avec `?new=<userId>` : la page
 * retrouve ou crée le fil (startConversation) puis redirige dessus, pour
 * qu'aucune page d'origine n'ait sa propre logique de création.
 */
export default async function MessageriePage(props: { searchParams: Promise<{ new?: string }> }) {
  const searchParams = await props.searchParams;
  if (searchParams.new) {
    const result = await startConversation(searchParams.new);
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
