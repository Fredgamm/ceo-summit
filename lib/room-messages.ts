import { getSignedDownloadUrl } from "@/lib/r2";

interface StoredRoomMessage {
  content: string;
  attachmentKey: string | null;
  deletedAt: Date | null;
}

/**
 * Prépare un message de salle pour le navigateur (chargement initial de
 * app/salles/[id]/page.tsx et pagination de /api/rooms/[id]/messages) :
 * - la clé privée de la pièce jointe devient une URL signée de courte durée ;
 * - un message modéré (`deletedAt`) perd son contenu et sa pièce jointe. Le
 *   client n'affiche que "[Message supprimé]", mais le texte d'origine
 *   restait lisible dans la réponse JSON / le payload RSC.
 */
export async function toClientRoomMessage<M extends StoredRoomMessage>({
  attachmentKey,
  ...message
}: M): Promise<Omit<M, "attachmentKey"> & { attachmentUrl: string | null }> {
  if (message.deletedAt) {
    return { ...message, content: "", attachmentUrl: null };
  }
  return {
    ...message,
    attachmentUrl: attachmentKey
      ? await getSignedDownloadUrl(
          process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
          attachmentKey
        )
      : null,
  };
}
