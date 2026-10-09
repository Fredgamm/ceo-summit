import { cn, formatAriary } from "@/lib/utils";

/**
 * 9 oct. 2026 — l'euro est le montant affiché ; l'Ariary l'accompagne en
 * petit libellé discret. `exact` : montant réellement facturé (« soit … »),
 * sinon simple estimation au cours du jour (« ≈ … »).
 */
export function AriaryHint({
  amountAr,
  exact = false,
  className,
}: {
  amountAr: number;
  exact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("block text-[11px] tabular-nums text-text-muted", className)}>
      {exact ? "soit " : "≈ "}
      {formatAriary(amountAr)}
    </span>
  );
}
