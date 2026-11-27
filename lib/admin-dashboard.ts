/**
 * E8-T02 — pure computations for the admin dashboard, kept separate from
 * the page component so the MRR/revenue-series/activity-merge logic is
 * unit-testable without touching Prisma or the clock in awkward ways.
 */

const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mars",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sept",
  "Oct",
  "Nov",
  "Déc",
];

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

/**
 * "MRR (Ar) — Revenus mensuels" — each active membership's total price is
 * spread evenly across its term (annual price / 12 for a 1-year term) since
 * there's no separate recurring-billing record to read MRR from directly.
 */
export function computeMRR(
  memberships: { price: number; startDate: Date; endDate: Date }[]
): number {
  let total = 0;
  for (const m of memberships) {
    const months = Math.max(1, monthsBetween(m.startDate, m.endDate));
    total += m.price / months;
  }
  return Math.round(total);
}

export interface RevenueEntry {
  amount: number;
  date: Date;
}

export interface MonthlyRevenuePoint {
  monthKey: string;
  label: string;
  amount: number;
}

/** Trailing `monthsBack` calendar months ending at `now`'s month, oldest first. */
export function buildMonthlyRevenueSeries(
  entries: RevenueEntry[],
  monthsBack = 12,
  now: Date = new Date()
): MonthlyRevenuePoint[] {
  const points: MonthlyRevenuePoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({
      monthKey: `${d.getFullYear()}-${d.getMonth()}`,
      label: MONTH_LABELS[d.getMonth()],
      amount: 0,
    });
  }

  const byKey = new Map(points.map((p) => [p.monthKey, p]));
  for (const entry of entries) {
    const key = `${entry.date.getFullYear()}-${entry.date.getMonth()}`;
    const point = byKey.get(key);
    if (point) point.amount += entry.amount;
  }

  return points;
}

export interface ActivityItem {
  type: string;
  message: string;
  date: Date;
}

/** Merge heterogeneous activity sources (memberships, registrations, applications...) into one feed. */
export function buildActivityFeed(items: ActivityItem[], limit = 8): ActivityItem[] {
  return [...items].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}

/**
 * 27 nov. 2026 — places vendues pour un événement : somme des places des
 * abonnements actifs (quota de l'offre + suppléments). Une offre sans
 * plafond (Staff, quota non renseigné) est comptée à part, pas en places.
 */
export function sumSeatsSold(caps: (number | null)[]): { seats: number; unlimited: number } {
  let seats = 0;
  let unlimited = 0;
  for (const cap of caps) {
    if (cap == null) unlimited++;
    else seats += cap;
  }
  return { seats, unlimited };
}

/** Somme des montants encaissés, au total et depuis une date (début du mois en cours). */
export function sumCollected(
  entries: { amount: number; amountEur: number; date: Date }[],
  since: Date
): { totalAr: number; totalEur: number; sinceAr: number; count: number } {
  let totalAr = 0;
  let totalEur = 0;
  let sinceAr = 0;
  for (const e of entries) {
    totalAr += e.amount;
    totalEur += e.amountEur;
    if (e.date >= since) sinceAr += e.amount;
  }
  return { totalAr, totalEur: Math.round(totalEur * 100) / 100, sinceAr, count: entries.length };
}
