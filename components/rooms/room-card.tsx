import Link from "next/link";
import { MessagesSquare, Users } from "lucide-react";

export interface RoomCardData {
  id: string;
  name: string;
  description: string | null;
  sector: string;
  unread: boolean;
}

interface RoomCardProps extends RoomCardData {
  onlineCount?: number;
}

/**
 * E4-T02 — carte salle, badge "non lu".
 *
 * Décision d'architecture (sept. 2026, conception/09) — accès égal pour tout
 * membre dont l'entreprise a une offre active/validée : le badge de palier
 * et l'état "verrouillé" ont disparu, puisqu'aucune salle n'est plus
 * réservée à un tier (voir lib/rooms-query.ts::meetsRoomAccess).
 */
export function RoomCard({ id, name, description, sector, unread, onlineCount }: RoomCardProps) {
  return (
    <Link
      href={`/salles/${id}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5 transition-shadow hover:shadow-card-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/10 text-navy">
            <MessagesSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy">{name}</h3>
            <p className="text-xs text-text-muted">{sector}</p>
          </div>
        </div>
        {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
      </div>

      {description && <p className="line-clamp-2 text-sm text-text-mid">{description}</p>}

      {onlineCount != null && (
        <span className="mt-auto flex items-center gap-1 border-t border-border pt-3 text-xs text-text-muted">
          <Users className="h-3.5 w-3.5" />
          {onlineCount} en ligne
        </span>
      )}
    </Link>
  );
}
