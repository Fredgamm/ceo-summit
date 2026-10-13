import { cn, formatAriary, formatEuro } from "@/lib/utils";

export type MembershipCardStatus = "draft" | "invited" | "payment" | "review" | "active";

const STATUS_LABEL: Record<MembershipCardStatus, string> = {
  draft: "En préparation",
  invited: "Invitation",
  payment: "Paiement à régler",
  review: "En vérification",
  active: "Membre actif",
};

/**
 * Carte de membre du parcours d'adhésion (9 oct. 2026) : elle se complète au
 * fil des étapes — offre choisie, puis entreprise, puis statut. Format d'une
 * carte physique (ratio 1,586) ; filet doré en tête comme un liseré de carte.
 */
export function MembershipCard({
  planName,
  priceEur,
  priceAr,
  priceSuffix,
  detail,
  companyName,
  status = "draft",
  className,
}: {
  planName?: string | null;
  priceEur?: number | null;
  priceAr?: number | null;
  priceSuffix?: string;
  /** Ligne secondaire : places incluses, invité par… */
  detail?: string | null;
  companyName?: string | null;
  status?: MembershipCardStatus;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-[1.586] w-full max-w-[340px] flex-col justify-between overflow-hidden rounded-xl bg-navy-dark p-5 text-white shadow-card-lg ring-1 ring-white/10",
        className
      )}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gold" />
      <span
        aria-hidden="true"
        className="absolute -right-10 -top-16 h-44 w-44 rounded-full border border-gold/20"
      />
      <span
        aria-hidden="true"
        className="absolute -right-4 -top-10 h-44 w-44 rounded-full border border-gold/10"
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">CEO Summit</p>
        <span
          className={cn(
            "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
            status === "active" ? "bg-gold text-navy" : "bg-white/10 text-white/80"
          )}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="relative">
        <p className="font-serif text-2xl font-bold leading-tight">
          {planName ?? <span className="text-white/35">Votre offre</span>}
        </p>
        {priceEur != null && (
          <p className="mt-1 text-sm font-semibold text-white/90">
            {formatEuro(priceEur)}
            {priceSuffix}
            {priceAr != null && (
              <span className="ml-2 text-[11px] font-normal text-white/45">
                ≈ {formatAriary(priceAr)}
              </span>
            )}
          </p>
        )}
        {detail && <p className="mt-0.5 text-xs text-white/55">{detail}</p>}
      </div>

      <p className="relative truncate border-t border-white/10 pt-3 text-sm font-semibold tracking-wide">
        {companyName ?? <span className="font-normal text-white/35">Votre entreprise</span>}
      </p>
    </div>
  );
}
