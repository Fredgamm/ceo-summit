"use client";

import * as React from "react";

import { getSocketClient } from "@/lib/socket-client";
import { RoomCard, type RoomCardData } from "@/components/rooms/room-card";

/**
 * E4-T02 — "compteur membres en ligne" : one-shot snapshot fetched from the
 * Socket.io server on mount (not a live subscription — a viewer on the list
 * page hasn't joined any room, so there's nothing to push updates into).
 * Fails silently to "no count shown" if the socket server isn't reachable.
 */
export function RoomsGrid({ rooms }: { rooms: RoomCardData[] }) {
  const [onlineCounts, setOnlineCounts] = React.useState<Record<string, number>>({});
  const roomIds = React.useMemo(() => rooms.map((r) => r.id), [rooms]);

  React.useEffect(() => {
    if (roomIds.length === 0) return;
    let cancelled = false;

    getSocketClient()
      .then((socket) => {
        socket.emit("rooms:presence", roomIds, (counts: Record<string, number>) => {
          if (!cancelled) setOnlineCounts(counts);
        });
      })
      .catch(() => {
        /* Socket server unreachable — cards simply render without an online count. */
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIds.join(",")]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <RoomCard key={room.id} {...room} onlineCount={onlineCounts[room.id]} />
      ))}
    </div>
  );
}
