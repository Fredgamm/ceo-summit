"use server";

import { auth } from "@/auth";
import { getOrCreateConversation } from "@/lib/conversations";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E7-T02 — "Initiation depuis profil membre / fiche Deal Room / catalogue".
 * Every entry point calls this and redirects to /messagerie/[id] with the
 * result — the socket server owns actually sending/reading messages from
 * here on, this action only ever finds-or-creates the thread.
 */
export async function startConversation(
  otherUserId: string,
  opportunityId?: string
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };
  if (session.user.id === otherUserId) {
    return { success: false, error: "Vous ne pouvez pas vous envoyer un message à vous-même." };
  }

  const conversation = await getOrCreateConversation(session.user.id, otherUserId, opportunityId);
  return { success: true, data: { id: conversation.id } };
}
