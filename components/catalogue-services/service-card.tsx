import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDateFr, initials } from "@/lib/utils";

interface ServiceCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  priceInfo: string | null;
  gallery: string[];
  createdAt: Date | string;
  provider: { name: string; avatarUrl: string | null; companyName: string | null };
}

/** E5-T01 — carte fiche service, grille du catalogue. */
export function ServiceCard({
  id,
  title,
  description,
  category,
  priceInfo,
  gallery,
  createdAt,
  provider,
}: ServiceCardProps) {
  return (
    <Link
      href={`/catalogue/services/${id}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5 transition-shadow hover:shadow-card-md"
    >
      {gallery[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gallery[0]} alt="" className="h-36 w-full rounded-md object-cover" />
      )}

      <Badge variant="secondary" className="w-fit">
        {category}
      </Badge>

      <h3 className="text-base font-bold leading-snug text-navy">{title}</h3>
      <p className="line-clamp-2 text-sm text-text-mid">{description}</p>

      <div className="flex flex-wrap gap-2 text-xs text-text-muted">
        <span>Publié le {formatDateFr(createdAt)}</span>
        {priceInfo && <span>· {priceInfo}</span>}
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={provider.avatarUrl ?? undefined} alt={provider.name} />
          <AvatarFallback>{initials(provider.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{provider.name}</p>
          {provider.companyName && (
            <p className="truncate text-xs text-text-muted">{provider.companyName}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
