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

const TIER_RANK: Record<string, number> = { MEMBER: 1, EXECUTIVE: 2, CHAIRMAN: 3 };

/** Whether a member's tier satisfies a minimum tier requirement (e.g. an event's minTier). */
export function meetsMinTier(userTier: string | null | undefined, minTier: string): boolean {
  if (!userTier) return false;
  return (TIER_RANK[userTier] ?? 0) >= (TIER_RANK[minTier] ?? 0);
}
