import type { Prisma } from "@prisma/client";

/**
 * E7-T01 — always scope to the viewer's own conversations. "Recherche dans
 * les conversations" is implemented client-side (the whole list is small
 * and already loaded/decrypted) rather than as a server round-trip per
 * keystroke — see components/messages/conversation-list.tsx.
 */
export function buildConversationsWhere(viewerId: string): Prisma.ConversationWhereInput {
  return { OR: [{ member1Id: viewerId }, { member2Id: viewerId }] };
}

/** The other participant's id, given the viewer's id. */
export function otherParticipantId(
  conversation: { member1Id: string; member2Id: string },
  viewerId: string
): string {
  return conversation.member1Id === viewerId ? conversation.member2Id : conversation.member1Id;
}
