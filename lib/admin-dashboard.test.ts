import { describe, expect, it } from "vitest";

import { computeMRR, buildMonthlyRevenueSeries, buildActivityFeed } from "./admin-dashboard";

describe("computeMRR", () => {
  it("spreads an annual membership's price evenly across 12 months", () => {
    const mrr = computeMRR([
      { price: 1200000, startDate: new Date(2026, 0, 1), endDate: new Date(2027, 0, 1) },
    ]);
    expect(mrr).toBe(100000);
  });

  it("sums MRR across multiple memberships with different terms", () => {
    const mrr = computeMRR([
      { price: 1200000, startDate: new Date(2026, 0, 1), endDate: new Date(2027, 0, 1) }, // 100k/mo
      { price: 600000, startDate: new Date(2026, 0, 1), endDate: new Date(2026, 6, 1) }, // 6 months -> 100k/mo
    ]);
    expect(mrr).toBe(200000);
  });

  it("treats a same-month term as at least 1 month to avoid dividing by zero", () => {
    const mrr = computeMRR([
      { price: 50000, startDate: new Date(2026, 5, 1), endDate: new Date(2026, 5, 20) },
    ]);
    expect(mrr).toBe(50000);
  });

  it("returns 0 for no memberships", () => {
    expect(computeMRR([])).toBe(0);
  });
});

describe("buildMonthlyRevenueSeries", () => {
  const NOW = new Date(2026, 6, 28); // 28 July 2026

  it("returns monthsBack points ending at the current month, oldest first", () => {
    const series = buildMonthlyRevenueSeries([], 12, NOW);
    expect(series).toHaveLength(12);
    expect(series[0].label).toBe("Août"); // Aug 2025
    expect(series[11].label).toBe("Juil"); // Jul 2026
  });

  it("buckets entries into the matching month and sums same-month entries", () => {
    const series = buildMonthlyRevenueSeries(
      [
        { amount: 500000, date: new Date(2026, 6, 5) },
        { amount: 300000, date: new Date(2026, 6, 20) },
        { amount: 1000000, date: new Date(2026, 5, 1) },
      ],
      12,
      NOW
    );
    expect(series[11].amount).toBe(800000); // July
    expect(series[10].amount).toBe(1000000); // June
  });

  it("drops entries outside the requested window", () => {
    const series = buildMonthlyRevenueSeries(
      [{ amount: 999999, date: new Date(2020, 0, 1) }],
      12,
      NOW
    );
    expect(series.reduce((sum, p) => sum + p.amount, 0)).toBe(0);
  });
});

describe("buildActivityFeed", () => {
  it("sorts merged items by date descending and caps at the limit", () => {
    const items = [
      { type: "a", message: "oldest", date: new Date(2026, 0, 1) },
      { type: "b", message: "newest", date: new Date(2026, 6, 1) },
      { type: "c", message: "middle", date: new Date(2026, 3, 1) },
    ];

    const feed = buildActivityFeed(items, 2);

    expect(feed.map((i) => i.message)).toEqual(["newest", "middle"]);
  });
});
