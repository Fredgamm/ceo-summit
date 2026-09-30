import { formatAriary, formatEuro } from "@/lib/utils";

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
  if (plan.priceEur != null) {
    const liveAr = Math.round(plan.priceEur * liveEurToArRate);
    return (
      <div>
        <p className="text-lg font-bold text-navy">
          {formatEuro(plan.priceEur)}
          {suffix}
        </p>
        <p className="text-xs text-text-muted">
          ≈ {formatAriary(liveAr)} — se référer au cours du jour
        </p>
      </div>
    );
  }
  return (
    <p className="text-lg font-bold text-navy">
      {formatAriary(plan.priceAr)}
      {suffix}
    </p>
  );
}
