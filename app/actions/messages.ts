"use server";

import { z } from "zod";

import { getOrCreateConversation } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const startConversationSchema = z.object({ otherUserId: z.string().min(1) });

/**
 * Point d'entrée des liens "Envoyer un message" (profil membre, fiche
 * service) : `/messagerie?new=<userId>` appelle cette action puis redirige
 * vers /messagerie/[id]. Elle ne fait que retrouver ou créer le fil ; l'envoi
 * et la lecture des messages passent ensuite par le serveur socket.
 *
 * Ne rattache jamais d'opportunité : ce lien se fait uniquement quand
 * l'auteur accepte une demande de contact Deal Room (app/actions/deal-room.ts),
 * jamais depuis un paramètre d'URL.
 */
export async function startConversation(
  otherUserId: string
): Promise<ActionResult<{ id: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const parsed = startConversationSchema.safeParse({ otherUserId });
  if (!parsed.success) return { success: false, error: "Requête invalide." };

  if (viewer.id === parsed.data.otherUserId) {
    return { success: false, error: "Vous ne pouvez pas vous envoyer un message à vous-même." };
  }

  const otherUser = await prisma.user.findUnique({
    where: { id: parsed.data.otherUserId },
    select: { status: true },
  });
  if (otherUser?.status !== "ACTIVE") {
    return { success: false, error: "Ce membre n'est pas joignable." };
  }

  const conversation = await getOrCreateConversation(viewer.id, parsed.data.otherUserId);
  return { success: true, data: { id: conversation.id } };
}
