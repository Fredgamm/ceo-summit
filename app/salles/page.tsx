import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildRoomsWhere, meetsRoomAccess, type RoomsSearchParams } from "@/lib/rooms-query";
import { AppShell } from "@/components/layout/app-shell";
import { RoomsFilters } from "@/components/rooms/rooms-filters";
import { RoomsGrid } from "@/components/rooms/rooms-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Salles thématiques" };

/** E4-T02 — liste des salles, accès verrouillé par tier, badge "nouveau message". */
export default async function RoomsPage({ searchParams }: { searchParams: RoomsSearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!viewer) redirect("/login");

  const viewerTier = viewer.memberships[0]?.tier ?? null;
  const where = buildRoomsWhere(searchParams);

  const rooms = await prisma.room.findMany({ where, orderBy: { name: "asc" } });
  const roomIds = rooms.map((r) => r.id);

  const [reads, latestMessages] = await Promise.all([
    prisma.roomRead.findMany({ where: { userId: viewer.id, roomId: { in: roomIds } } }),
    prisma.roomMessage.groupBy({
      by: ["roomId"],
      where: { roomId: { in: roomIds } },
      _max: { createdAt: true },
    }),
  ]);
  const lastReadByRoom = new Map(reads.map((r) => [r.roomId, r.lastReadAt]));
  const lastMessageByRoom = new Map(latestMessages.map((m) => [m.roomId, m._max.createdAt]));

  const roomCards = rooms.map((room) => {
    const locked = !meetsRoomAccess(viewerTier, room.minTier);
    const lastMessageAt = lastMessageByRoom.get(room.id);
    const lastReadAt = lastReadByRoom.get(room.id);
    const unread = !locked && !!lastMessageAt && (!lastReadAt || lastMessageAt > lastReadAt);
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      sector: room.sector,
      minTier: room.minTier,
      locked,
      unread,
    };
  });

  const unreadCount = roomCards.filter((r) => r.unread).length;

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewerTier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.role === "ADMIN",
      }}
      badges={{ rooms: unreadCount || undefined }}
    >
      <div className="mb-4">
        <h1 className="text-xl font-bold text-navy">Salles thématiques</h1>
        <p className="mt-1 text-sm text-text-muted">
          Espaces de discussion privés réservés aux membres CEO Summit, organisés par secteur
          d&apos;activité.
        </p>
      </div>

      <RoomsFilters />

      {roomCards.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Aucune salle trouvée"
          description="Essayez d'autres filtres."
        />
      ) : (
        <RoomsGrid rooms={roomCards} />
      )}
    </AppShell>
  );
}
