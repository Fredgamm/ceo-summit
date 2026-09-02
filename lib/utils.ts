import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes intelligently, resolving conflicts (shadcn/ui standard helper).
 * Used by every shadcn component and across the app for conditional classNames.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

/** Display label for a Tier/Role enum value: "EXECUTIVE" -> "Executive". Falls back to "Membre" when absent. */
export function tierLabel(tier?: string | null): string {
  if (!tier) return "Membre";
  return tier.charAt(0) + tier.slice(1).toLowerCase();
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
