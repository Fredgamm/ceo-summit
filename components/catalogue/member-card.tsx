import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, initials, tierLabel } from "@/lib/utils";

interface MemberCardProps {
  id: string;
  name: string;
  title: string | null;
  companyName: string | null;
  country: string | null;
  avatarUrl: string | null;
  role: string;
  /** Nom de l'offre souscrite par l'entreprise (ex. "Executive Pass"), pour le badge premium. */
  offerName?: string | null;
  /**
   * Rapport QA du 30 sept. 2026 (§11) — met en avant la carte de l'offre la
   * plus chère actuellement souscrite (calculé côté page, pas ici : cette
   * carte n'a pas connaissance des autres offres existantes). Optionnel :
   * les usages hors annuaire (ex. widget "Nouveaux membres" du dashboard,
   * liste des membres d'une même entreprise) n'ont pas ce contexte.
   */
  isTopOffer?: boolean;
}

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

export function MemberCard({
  id,
  name,
  title,
  companyName,
  country,
  avatarUrl,
  role,
  offerName = null,
  isTopOffer = false,
}: MemberCardProps) {
  return (
    <Link
      href={`/membres/${id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white p-4 transition-shadow hover:shadow-card-md",
        isTopOffer ? "border-gold-pale ring-1 ring-gold" : "border-border"
      )}
    >
      <Avatar className="h-14 w-14 shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} alt={name} />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-navy">{name}</p>
        {title && <p className="truncate text-xs text-text-mid">{title}</p>}
        {companyName && <p className="truncate text-xs text-text-muted">{companyName}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {isTopOffer && offerName && <Badge variant="chairman">{offerName}</Badge>}
          {TIER_BADGE[role] && <Badge variant={TIER_BADGE[role]}>{tierLabel(role)}</Badge>}
          {country && <Badge variant="secondary">{country}</Badge>}
        </div>
      </div>
    </Link>
  );
}
