import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { meetsRoomAccess } from "@/lib/rooms-query";
import { getSignedDownloadUrl } from "@/lib/r2";

const PAGE_SIZE = 50;

/**
 * GET /api/rooms/[id]/messages?before=<messageId> — E4-T03 "Scroll infini
 * vers le haut (historique paginé)". The initial 50 messages are fetched
 * server-side by the page itself; this route only serves older pages as the
 * member scrolls up.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const [room, viewer] = await Promise.all([
    prisma.room.findUnique({ where: { id: params.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
    }),
  ]);
  if (!room || room.status !== "ACTIVE") {
    return NextResponse.json({ error: "Salle introuvable." }, { status: 404 });
  }
  if (!viewer || !meetsRoomAccess(viewer.memberships[0]?.tier ?? null, room.minTier)) {
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

  // B4 — same private-key → signed-URL resolution as the initial page load.
  const withUrls = await Promise.all(
    messages.map(async ({ attachmentKey, ...m }) => ({
      ...m,
      attachmentUrl: attachmentKey
        ? await getSignedDownloadUrl(
            process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
            attachmentKey
          )
        : null,
    }))
  );

  return NextResponse.json({ data: withUrls.reverse() }, { status: 200 });
}
