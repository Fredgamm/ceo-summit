import Link from "next/link";

import type { EventCapacityBadge } from "@/lib/events-query";
import { Badge } from "@/components/ui/badge";
import { formatAriary, formatDateFr, tierLabel } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  SUMMIT: "Summit",
  DINER: "Dîner privé",
  WEBINAIRE: "Webinaire",
  RENCONTRE: "Rencontre B2B",
};

const CAPACITY_BADGE: Record<
  EventCapacityBadge,
  { label: string; variant: "pending" | "refused" } | null
> = {
  ouvert: null,
  limite: { label: "Places limitées", variant: "pending" },
  complet: { label: "Complet", variant: "refused" },
};

interface EventCardProps {
  id: string;
  title: string;
  type: string;
  date: Date;
  location: string;
  isOnline: boolean;
  price: number;
  minTier: string;
  capacityBadge: EventCapacityBadge;
  isRegistered: boolean;
  tierOk: boolean;
}

export function EventCard({
  id,
  title,
  type,
  date,
  location,
  isOnline,
  price,
  minTier,
  capacityBadge,
  isRegistered,
  tierOk,
}: EventCardProps) {
  const capacity = CAPACITY_BADGE[capacityBadge];

  return (
    <Link
      href={`/evenements/${id}`}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-white transition-shadow hover:shadow-card-md"
    >
      <div className="bg-navy p-4 text-white">
        <p className="text-xs text-white/70">📅 {formatDateFr(date)}</p>
        <p className="mt-1 text-sm font-bold leading-snug">{title}</p>
        <p className="mt-1 text-xs text-white/60">{isOnline ? "🌐 En ligne" : `📍 ${location}`}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{TYPE_LABEL[type] ?? type}</Badge>
          {minTier !== "MEMBER" && <Badge variant="secondary">{tierLabel(minTier)}+</Badge>}
          {capacity && <Badge variant={capacity.variant}>{capacity.label}</Badge>}
          {isRegistered && <Badge variant="approved">Inscrit ✓</Badge>}
        </div>
        <div className="mt-auto flex items-center justify-between">
          <span className="text-sm font-bold text-navy">
            {price === 0 ? "Gratuit" : formatAriary(price)}
          </span>
          {!isRegistered && (
            <span className="text-xs font-semibold text-navy-mid">
              {!tierOk
                ? `Accès ${tierLabel(minTier)} requis`
                : capacityBadge === "complet"
                  ? "Complet"
                  : "S'inscrire →"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
