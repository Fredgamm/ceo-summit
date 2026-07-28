import Link from "next/link";
import type { RoomAccessLevel } from "@prisma/client";
import { Lock, MessagesSquare, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ROOM_ACCESS_LABEL } from "@/lib/rooms-query";
import { cn } from "@/lib/utils";

const ACCESS_BADGE: Record<RoomAccessLevel, "member" | "executive" | "chairman"> = {
  ALL_MEMBERS: "member",
  EXECUTIVE_PLUS: "executive",
  CHAIRMAN_ONLY: "chairman",
};

export interface RoomCardData {
  id: string;
  name: string;
  description: string | null;
  sector: string;
  minTier: RoomAccessLevel;
  locked: boolean;
  unread: boolean;
}

interface RoomCardProps extends RoomCardData {
  onlineCount?: number;
}

/** E4-T02 — carte salle : accès verrouillé si tier insuffisant, badge "non lu". */
export function RoomCard({
  id,
  name,
  description,
  sector,
  minTier,
  locked,
  unread,
  onlineCount,
}: RoomCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              locked ? "bg-surface-2 text-text-muted" : "bg-navy/10 text-navy"
            )}
          >
            {locked ? <Lock className="h-4 w-4" /> : <MessagesSquare className="h-4 w-4" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy">{name}</h3>
            <p className="text-xs text-text-muted">{sector}</p>
          </div>
        </div>
        {unread && !locked && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
      </div>

      {description && <p className="line-clamp-2 text-sm text-text-mid">{description}</p>}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <Badge variant={ACCESS_BADGE[minTier]}>{ROOM_ACCESS_LABEL[minTier]}</Badge>
        {!locked && onlineCount != null && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Users className="h-3.5 w-3.5" />
            {onlineCount} en ligne
          </span>
        )}
      </div>
    </>
  );

  if (locked) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5 opacity-60">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/salles/${id}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5 transition-shadow hover:shadow-card-md"
    >
      {content}
    </Link>
  );
}
