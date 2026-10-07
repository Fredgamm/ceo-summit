import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes intelligently, resolving conflicts (shadcn/ui standard helper).
 * Used by every shadcn component and across the app for conditional classNames.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Rapport QA du 1er octobre 2026 — "1 participants inclus" / "À partir de
 * 1 participants" s'affichait au singulier mal accordé partout où le texte
 * était généré par interpolation brute (Early Bird et Executive Pass sont
 * toutes deux à 1 participant). `word` au singulier, le "s" est ajouté ici.
 */
export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

/** Format Ariary amounts consistently across the app: 1500000 -> "1 500 000 Ar" */
export function formatAriary(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} Ar`;
}

/** Format euro amounts consistently across the app: 50000 -> "50 000 €" */
export function formatEuro(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} €`;
}

/**
 * 3 septembre 2026 — prix d'une offre pour l'affichage public : en euros
 * avec l'estimation Ariary en complément si `priceEur` est renseigné,
 * sinon en Ariary seul (comportement historique).
 */
export function formatPlanPrice(plan: { priceAr: number; priceEur?: number | null }): string {
  if (plan.priceEur != null) {
    return `${formatEuro(plan.priceEur)} (≈ ${formatAriary(plan.priceAr)})`;
  }
  return formatAriary(plan.priceAr);
}

/**
 * Rapport QA du 30 sept. 2026 (§10) — variante d'affichage de
 * `formatPlanPrice` où l'estimation "≈ X Ar" suit le cours du jour
 * (`lib/currency-conversion.ts::getEurToArRate`, fourni par l'appelant —
 * un composant serveur, l'appel réseau/cache ne doit pas se faire ici) au
 * lieu de la valeur figée `plan.priceAr`. Ne change RIEN au montant
 * réellement dû/facturé (toujours `plan.priceAr`, lu par
 * `lib/company-payment-amount.ts`) — seulement l'affichage informatif, pour
 * ne jamais faire varier le montant qu'une entreprise doit effectivement
 * payer pendant qu'un paiement est en cours.
 */
export function formatPlanPriceLive(
  plan: { priceAr: number; priceEur?: number | null },
  liveEurToArRate: number
): string {
  if (plan.priceEur != null) {
    const liveAr = Math.round(plan.priceEur * liveEurToArRate);
    return `${formatEuro(plan.priceEur)} (≈ ${formatAriary(liveAr)} au cours du jour)`;
  }
  return formatAriary(plan.priceAr);
}

/** Format a date the CEO Summit way: 15 août 2026 */
export function formatDateFr(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Initials fallback for avatars: "Jean-Pierre Rakoto" -> "JR" */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Décision d'architecture (sept. 2026, conception/09) — accès égal pour tout
 * membre dont l'entreprise a une offre active/validée : un événement reste
 * accessible dès qu'un tier existe, plus seulement à partir de son
 * `minTier`. `userTier` non nul veut déjà dire "offre active/expirée mais
 * valable" (getViewerTierFromCompany, RG-12). `minTier` reste au paramètre
 * — et `Event.minTier` en base — pour ne pas casser les appelants.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so callers/signature don't change; see doc-comment above
export function meetsMinTier(userTier: string | null | undefined, _minTier: string): boolean {
  return userTier != null;
}
