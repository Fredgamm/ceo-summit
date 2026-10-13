import { describe, expect, it } from "vitest";

import {
  officialOfferEur,
  companyPaymentToTransaction,
  computeMRRByPlan,
  mergeFinanceTransactions,
  toEuroAmount,
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

describe("mergeFinanceTransactions", () => {
  const make = (id: string, date: string): FinanceTransaction => ({
    id,
    source: "COMPANY",
    memberName: "X",
    description: "d",
    amount: 1,
    eurToArRate: null,
    officialEur: null,
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

describe("companyPaymentToTransaction", () => {
  const gold = {
    name: "Gold",
    priceAr: 125_036_663,
    priceEur: 25_000,
    pricingMode: "FIXED_BUNDLE",
  };
  const payment = {
    id: "pay_1",
    amount: 125_036_663,
    eurToArRate: 4944.22,
    method: "VIREMENT",
    createdAt: new Date("2026-09-30T10:00:00Z"),
    upsellQuantity: null,
    upsellPlan: null,
    companySubscription: { company: { name: "Société X" }, plan: gold },
  };

  it("describes an offer payment by its plan, with the official euro price", () => {
    expect(companyPaymentToTransaction(payment)).toEqual({
      id: "pay_1",
      source: "COMPANY",
      memberName: "Société X",
      description: "Offre Gold",
      amount: 125_036_663,
      eurToArRate: 4944.22,
      officialEur: 25_000,
      method: "VIREMENT",
      date: payment.createdAt,
    });
  });

  it("multiplies a per-participant offer by the participants paid for", () => {
    const tx = companyPaymentToTransaction({
      ...payment,
      amount: 3_738_000 * 12,
      companySubscription: {
        company: { name: "Société X" },
        plan: {
          name: "Groupement 10",
          priceAr: 3_738_000,
          priceEur: 750,
          pricingMode: "PER_PARTICIPANT",
        },
      },
    });
    expect(tx.officialEur).toBe(9000);
  });

  it("labels a seat upsell as such and prices it by quantity", () => {
    const tx = companyPaymentToTransaction({
      ...payment,
      upsellQuantity: 3,
      upsellPlan: { name: "Executive Pass", priceEur: 950 },
    });
    expect(tx.description).toBe("Supplément Executive Pass × 3");
    expect(tx.officialEur).toBe(2850);
  });

  it("has no official euro price when the offer has none", () => {
    const tx = companyPaymentToTransaction({
      ...payment,
      companySubscription: { company: { name: "Société X" }, plan: { ...gold, priceEur: null } },
    });
    expect(tx.officialEur).toBeNull();
  });
});

describe("toEuroAmount", () => {
  const tx = (
    amount: number,
    eurToArRate: number | null,
    officialEur: number | null = null
  ): FinanceTransaction => ({
    id: "t",
    source: "COMPANY",
    memberName: "X",
    description: "d",
    amount,
    eurToArRate,
    officialEur,
    method: "VIREMENT",
    date: new Date("2026-10-07"),
  });

  it("uses the official offer price when there is one, whatever the rate", () => {
    expect(toEuroAmount(tx(125_036_663, 4944.22, 25_000), 4800)).toEqual({
      amountEur: 25_000,
      rate: 4944.22,
      rateEstimated: false,
    });
  });

  it("converts with the rate recorded at payment time otherwise", () => {
    expect(toEuroAmount(tx(10_000_000, 5000), 4800)).toEqual({
      amountEur: 2000,
      rate: 5000,
      rateEstimated: false,
    });
  });

  it("falls back to today's rate, flagged as estimated, for older payments", () => {
    expect(toEuroAmount(tx(9_700_000, null), 4850)).toEqual({
      amountEur: 2000,
      rate: 4850,
      rateEstimated: true,
    });
  });

  it("rounds to the cent", () => {
    expect(toEuroAmount(tx(1000, 3000), 3000).amountEur).toBe(0.33);
  });
});

describe("officialOfferEur with the payment's rate", () => {
  it("counts the participants paid at the rate recorded with the payment", () => {
    const plan = { priceAr: 3_700_000, priceEur: 750, pricingMode: "PER_PARTICIPANT" };
    const amountAr = Math.round(750 * 5062.93) * 12;
    expect(officialOfferEur(plan, amountAr, 5062.93)).toBe(750 * 12);
  });
});
