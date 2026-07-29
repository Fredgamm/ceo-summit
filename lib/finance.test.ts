import { describe, expect, it } from "vitest";

import {
  computeMRRByTier,
  buildExpiringWithinDays,
  mergeFinanceTransactions,
  type FinanceTransaction,
} from "./finance";

describe("computeMRRByTier", () => {
  it("groups and sums MRR per tier independently", () => {
    const result = computeMRRByTier([
      {
        tier: "CHAIRMAN",
        price: 1_200_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        tier: "CHAIRMAN",
        price: 1_200_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        tier: "EXECUTIVE",
        price: 600_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
    ]);

    expect(result.CHAIRMAN).toBe(200_000);
    expect(result.EXECUTIVE).toBe(50_000);
    expect(result.MEMBER).toBe(0);
  });

  it("returns all-zero for no memberships", () => {
    expect(computeMRRByTier([])).toEqual({ MEMBER: 0, EXECUTIVE: 0, CHAIRMAN: 0 });
  });
});

describe("buildExpiringWithinDays", () => {
  it("builds a range from now to now+days", () => {
    const now = new Date("2026-07-29T00:00:00.000Z");
    expect(buildExpiringWithinDays(30, now)).toEqual({
      gt: now,
      lte: new Date("2026-08-28T00:00:00.000Z"),
    });
  });
});

describe("mergeFinanceTransactions", () => {
  const make = (id: string, date: string): FinanceTransaction => ({
    id,
    source: "MEMBERSHIP",
    memberName: "X",
    description: "d",
    amount: 1,
    method: "Evolia",
    date: new Date(date),
  });

  it("sorts most-recent first", () => {
    const result = mergeFinanceTransactions([
      make("a", "2026-01-01"),
      make("b", "2026-07-01"),
      make("c", "2026-03-01"),
    ]);
    expect(result.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("truncates to the given limit", () => {
    const items = Array.from({ length: 40 }, (_, i) => make(String(i), "2026-01-01"));
    expect(mergeFinanceTransactions(items, 30)).toHaveLength(30);
  });
});
