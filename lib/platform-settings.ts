import type { Tier } from "@prisma/client";

/**
 * E8-T11 — `PlatformSetting` is a key/value store that existed in the schema
 * since early on ("Key/value store for editable pricing shown in
 * /admin/parametres — Tarifs tab") but was never actually read anywhere —
 * membership prices were hardcoded in `components/admin/candidature-decision-panel.tsx`
 * instead. These defaults match those hardcoded values so nothing changes
 * for a fresh install until an admin edits a price in Paramètres.
 */
export const DEFAULT_MEMBERSHIP_PRICES: Record<Tier, number> = {
  MEMBER: 200_000,
  EXECUTIVE: 600_000,
  CHAIRMAN: 1_500_000,
};

export const DEFAULT_INCLUDED_CREDITS: Record<"MEMBER" | "EXECUTIVE", number> = {
  MEMBER: 0,
  EXECUTIVE: 10,
};

export function membershipPriceKey(tier: Tier): string {
  return `membership_price_${tier.toLowerCase()}`;
}

export function creditsIncludedKey(tier: "MEMBER" | "EXECUTIVE"): string {
  return `credits_included_${tier.toLowerCase()}`;
}

export interface PlatformSettingRow {
  key: string;
  value: string;
}

export function parseMembershipPrices(rows: PlatformSettingRow[]): Record<Tier, number> {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const read = (tier: Tier) => {
    const raw = byKey.get(membershipPriceKey(tier));
    const parsed = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_MEMBERSHIP_PRICES[tier];
  };
  return { MEMBER: read("MEMBER"), EXECUTIVE: read("EXECUTIVE"), CHAIRMAN: read("CHAIRMAN") };
}

export function parseIncludedCredits(
  rows: PlatformSettingRow[]
): Record<"MEMBER" | "EXECUTIVE", number> {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const read = (tier: "MEMBER" | "EXECUTIVE") => {
    const raw = byKey.get(creditsIncludedKey(tier));
    const parsed = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_INCLUDED_CREDITS[tier];
  };
  return { MEMBER: read("MEMBER"), EXECUTIVE: read("EXECUTIVE") };
}
