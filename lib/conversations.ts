import { prisma } from "@/lib/prisma";
import type { Conversation } from "@prisma/client";

/**
 * E7-T02/T04 — single source of truth for "find or start a conversation
 * between two members", used by every initiation entry point (profil
 * membre, catalogue, acceptation d'un contact Deal Room). Normalizes
 * member1Id/member2Id ordering so the same pair always maps to the same
 * row, matching the `@@unique([member1Id, member2Id])` constraint.
 */
export async function getOrCreateConversation(
  userIdA: string,
  userIdB: string,
  opportunityId?: string
): Promise<Conversation> {
  if (userIdA === userIdB) {
    throw new Error("Impossible de démarrer une conversation avec soi-même.");
  }
  const [member1Id, member2Id] = [userIdA, userIdB].sort();

  const existing = await prisma.conversation.findUnique({
    where: { member1Id_member2Id: { member1Id, member2Id } },
  });
  if (existing) {
    if (opportunityId && !existing.opportunityId) {
      return prisma.conversation.update({ where: { id: existing.id }, data: { opportunityId } });
    }
    return existing;
  }

  return prisma.conversation.create({ data: { member1Id, member2Id, opportunityId } });
}
