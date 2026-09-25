import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { decryptMessages } from "@/lib/message-crypto";
import { requireViewer } from "@/lib/require-viewer";

const PAGE_SIZE = 50;

/**
 * GET /api/messagerie/[id]/messages?before=<messageId> — E7-T02 "Scroll
 * infini vers le haut (historique paginé)". Decryption happens here,
 * server-side, before the plaintext ever reaches the client.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Audit sécurité (25 septembre 2026) — relit `User.status` (et la date de
  // changement de mot de passe) en base plutôt que de se fier au seul JWT.
  const viewerResult = await requireViewer();
  if (!viewerResult.success) {
    return NextResponse.json({ error: viewerResult.error }, { status: 401 });
  }
  const { viewer } = viewerResult;

  const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }
  if (conversation.member1Id !== viewer.id && conversation.member2Id !== viewer.id) {
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
