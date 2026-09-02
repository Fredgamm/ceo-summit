"use server";

import { z } from "zod";

import { getOrCreateConversation } from "@/lib/conversations";
import { requireViewer } from "@/lib/require-viewer";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const startConversationSchema = z.object({
  otherUserId: z.string().min(1),
  opportunityId: z.string().min(1).optional(),
});

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
  // Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
  // "session non révoquée après sanction" : cette action ne vérifiait que la
  // présence d'une session, jamais `User.status` en base, contrairement aux
  // autres actions déjà migrées vers `requireViewer()`.
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const parsed = startConversationSchema.safeParse({ otherUserId, opportunityId });
  if (!parsed.success) return { success: false, error: "Requête invalide." };

  if (viewer.id === parsed.data.otherUserId) {
    return { success: false, error: "Vous ne pouvez pas vous envoyer un message à vous-même." };
  }

  const conversation = await getOrCreateConversation(
    viewer.id,
    parsed.data.otherUserId,
    parsed.data.opportunityId
  );
  return { success: true, data: { id: conversation.id } };
}
