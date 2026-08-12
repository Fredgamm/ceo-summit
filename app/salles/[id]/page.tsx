import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markRoomAsRead } from "@/app/actions/rooms";
import { meetsRoomAccess, ROOM_ACCESS_LABEL } from "@/lib/rooms-query";
import { countUnreadMessages } from "@/lib/conversations";
import { getSignedDownloadUrl } from "@/lib/r2";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { RoomChat } from "@/components/rooms/room-chat";
import { Badge } from "@/components/ui/badge";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Salle" };

const ACCESS_BADGE = {
  ALL_MEMBERS: "member",
  EXECUTIVE_PLUS: "executive",
  CHAIRMAN_ONLY: "chairman",
} as const;
const MESSAGE_PAGE_SIZE = 50;

/** E4-T03 — chat de salle, historique initial + composant temps réel côté client. */
export default async function RoomPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const room = await prisma.room.findUnique({ where: { id: params.id } });
  if (!room || room.status !== "ACTIVE") notFound();

  const viewerTier = getViewerTierFromCompany(viewer.company);
  if (!meetsRoomAccess(viewerTier, room.minTier)) notFound();

  const [messages] = await Promise.all([
    prisma.roomMessage.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_PAGE_SIZE,
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    markRoomAsRead(room.id),
  ]);
  const unreadMessages = await countUnreadMessages(viewer.id);

  // B4 (audit du 29 juillet 2026) — attachmentKey is a private R2 key,
  // resolved here to a short-lived signed URL for the initial page load
  // (live messages are resolved the same way in server/socket-server.ts).
  const messagesWithUrls = await Promise.all(
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

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewerTier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <Link href="/salles" className="mb-3 inline-block text-sm text-text-muted">
        ← Salles thématiques
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{room.sector}</Badge>
        <Badge variant={ACCESS_BADGE[room.minTier]}>{ROOM_ACCESS_LABEL[room.minTier]}</Badge>
      </div>

      <RoomChat
        room={{ id: room.id, name: room.name }}
        initialMessages={messagesWithUrls.reverse()}
        hasMoreOlder={messages.length === MESSAGE_PAGE_SIZE}
        viewer={{ id: viewer.id }}
      />
    </AppShell>
  );
}
