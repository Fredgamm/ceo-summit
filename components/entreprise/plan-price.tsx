import { formatEuro, planPriceEur } from "@/lib/utils";
import { AriaryHint } from "@/components/ui/ariary-hint";

/**
 * Rapport QA du 30 sept. 2026 — sur les cartes d'offre, l'euro doit être la
 * valeur principale (offres cotées en €) et l'estimation Ariary secondaire,
 * petite, avec une mention explicite du cours du jour plutôt que noyée dans
 * la même ligne que `formatPlanPriceLive` (utilisé ailleurs, pour du texte
 * simple en une ligne : options de select, récapitulatifs).
 */
export function PlanPrice({
  plan,
  liveEurToArRate,
  suffix,
}: {
  plan: { priceAr: number; priceEur?: number | null };
  liveEurToArRate: number;
  suffix?: string;
}) {
  // 9 oct. 2026 — euros uniquement (plus d'estimation en Ariary).
  const estimatedAr =
    plan.priceEur != null ? Math.round(plan.priceEur * liveEurToArRate) : plan.priceAr;
  return (
    <div>
      <p className="text-lg font-bold text-navy">
        {formatEuro(planPriceEur(plan, liveEurToArRate))}
        {suffix}
      </p>
      <AriaryHint amountAr={estimatedAr} />
    </div>
  );
}
