import { describe, expect, it } from "vitest";

import {
  computeMRRByPlan,
  buildExpiringWithinDays,
  mergeFinanceTransactions,
  type FinanceTransaction,
} from "./finance";

describe("computeMRRByPlan", () => {
  it("groups and sums MRR per plan independently", () => {
    const result = computeMRRByPlan([
      {
        planId: "plan_chairman",
        price: 1_200_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        planId: "plan_chairman",
        price: 1_200_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        planId: "plan_executive",
        price: 600_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
    ]);

    expect(result.get("plan_chairman")).toBe(200_000);
    expect(result.get("plan_executive")).toBe(50_000);
    expect(result.get("plan_member")).toBeUndefined();
  });

  it("returns an empty map for no memberships", () => {
    expect(computeMRRByPlan([])).toEqual(new Map());
  });

  it("scales to more than 3 plans (dynamic offer count, not a fixed tier bucket)", () => {
    const result = computeMRRByPlan([
      {
        planId: "plan_a",
        price: 100_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        planId: "plan_b",
        price: 200_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        planId: "plan_c",
        price: 300_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        planId: "plan_d",
        price: 400_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      {
        planId: "plan_e",
        price: 500_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
    ]);

    expect(result.size).toBe(5);
    expect(result.get("plan_e")).toBeCloseTo(41_667, 0);
  });

  it("buckets memberships with no planId under 'unknown' instead of dropping them", () => {
    const result = computeMRRByPlan([
      {
        planId: null,
        price: 240_000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
    ]);
    expect(result.get("unknown")).toBe(20_000);
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
