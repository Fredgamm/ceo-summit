import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { meetsRoomAccess } from "@/lib/rooms-query";
import { requireViewer } from "@/lib/require-viewer";
import { getViewerTierFromCompany } from "@/lib/plan-access";
import { toClientRoomMessage } from "@/lib/room-messages";

const PAGE_SIZE = 50;

/**
 * GET /api/rooms/[id]/messages?before=<messageId> — E4-T03 "Scroll infini
 * vers le haut (historique paginé)". The initial 50 messages are fetched
 * server-side by the page itself; this route only serves older pages as the
 * member scrolls up.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Audit sécurité (25 septembre 2026) — relit `User.status` (et la date de
  // changement de mot de passe) en base plutôt que de se fier au seul JWT.
  const viewerResult = await requireViewer();
  if (!viewerResult.success) {
    return NextResponse.json({ error: viewerResult.error }, { status: 401 });
  }
  const { viewer } = viewerResult;

  const room = await prisma.room.findUnique({ where: { id: params.id } });
  if (!room || room.status !== "ACTIVE") {
    return NextResponse.json({ error: "Salle introuvable." }, { status: 404 });
  }
  if (!meetsRoomAccess(getViewerTierFromCompany(viewer.company), room.minTier)) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }

  const before = new URL(req.url).searchParams.get("before");
  let cursor: { createdAt: Date } | undefined;
  if (before) {
    // Scoped to this room — a message id from another room must not leak
    // its createdAt as a pagination cursor here (audit du 29 juillet 2026).
    const beforeMessage = await prisma.roomMessage.findFirst({
      where: { id: before, roomId: params.id },
    });
    if (beforeMessage) cursor = { createdAt: beforeMessage.createdAt };
  }

  const messages = await prisma.roomMessage.findMany({
    where: { roomId: params.id, ...(cursor && { createdAt: { lt: cursor.createdAt } }) },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  const withUrls = await Promise.all(messages.map(toClientRoomMessage));

  return NextResponse.json({ data: withUrls.reverse() }, { status: 200 });
}
