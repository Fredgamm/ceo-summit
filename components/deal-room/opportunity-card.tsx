import Link from "next/link";
import type { OpportunityType, Tier } from "@prisma/client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatAriary, formatDateFr, initials, tierLabel } from "@/lib/utils";

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  PARTENARIAT: "Partenariat",
  INVESTISSEMENT: "Investissement",
  APPEL_OFFRES: "Appel à offres",
  LEVEE_FONDS: "Levée de fonds",
  JOINT_VENTURE: "Joint-venture",
};

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

interface OpportunityCardProps {
  id: string;
  title: string;
  description: string;
  type: OpportunityType;
  sector: string;
  budget: number | null;
  deadline: Date | null;
  createdAt: Date;
  author: { name: string; title: string | null; avatarUrl: string | null; role: string };
  authorTier: Tier | null;
}

export function OpportunityCard({
  id,
  title,
  description,
  type,
  sector,
  budget,
  deadline,
  createdAt,
  author,
  authorTier,
}: OpportunityCardProps) {
  return (
    <Link
      href={`/deal-room/${id}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5 transition-shadow hover:shadow-card-md"
    >
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{OPPORTUNITY_TYPE_LABEL[type]}</Badge>
        <Badge variant="secondary">{sector}</Badge>
      </div>

      <h3 className="text-base font-bold leading-snug text-navy">{title}</h3>
      <p className="line-clamp-2 text-sm text-text-mid">{description}</p>

      <div className="flex flex-wrap gap-2 text-xs text-text-muted">
        <span>Publié le {formatDateFr(createdAt)}</span>
        {budget != null && <span>· Budget : {formatAriary(budget)}</span>}
        {deadline && <span>· Échéance : {formatDateFr(deadline)}</span>}
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={author.avatarUrl ?? undefined} alt={author.name} />
          <AvatarFallback>{initials(author.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{author.name}</p>
          {author.title && <p className="truncate text-xs text-text-muted">{author.title}</p>}
        </div>
        {authorTier && <Badge variant={TIER_BADGE[authorTier]}>{tierLabel(authorTier)}</Badge>}
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-navy">
          1 crédit
        </span>
      </div>
    </Link>
  );
}
