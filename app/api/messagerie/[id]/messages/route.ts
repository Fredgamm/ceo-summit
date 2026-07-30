import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptMessages } from "@/lib/message-crypto";

const PAGE_SIZE = 50;

/**
 * GET /api/messagerie/[id]/messages?before=<messageId> — E7-T02 "Scroll
 * infini vers le haut (historique paginé)". Decryption happens here,
 * server-side, before the plaintext ever reaches the client.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }
  if (conversation.member1Id !== session.user.id && conversation.member2Id !== session.user.id) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }

  const before = new URL(req.url).searchParams.get("before");
  let cursor: { createdAt: Date } | undefined;
  if (before) {
    // Scoped to this conversation — a message id from another conversation
    // must not leak its createdAt as a pagination cursor here (audit du 29
    // juillet 2026).
    const beforeMessage = await prisma.message.findFirst({
      where: { id: before, conversationId: params.id },
    });
    if (beforeMessage) cursor = { createdAt: beforeMessage.createdAt };
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id, ...(cursor && { createdAt: { lt: cursor.createdAt } }) },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  const decrypted = await decryptMessages(messages.reverse());
  return NextResponse.json({ data: decrypted }, { status: 200 });
}
