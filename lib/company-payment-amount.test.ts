import { describe, expect, it } from "vitest";

import { computeDueAmount, meetsMinParticipants } from "./company-payment-amount";

describe("computeDueAmount", () => {
  it("multiplies the per-participant price by the declared count for a group plan", () => {
    expect(
      computeDueAmount(
        { priceAr: 2_250_000, minParticipants: 10, pricingMode: "PER_PARTICIPANT" },
        12
      )
    ).toBe(27_000_000);
  });

  it("returns the flat bundle price, ignoring the declared count", () => {
    expect(
      computeDueAmount(
        { priceAr: 20_000_000, minParticipants: null, pricingMode: "FIXED_BUNDLE" },
        3
      )
    ).toBe(20_000_000);
  });

  it("bills a plan with no explicit pricing mode as a flat bundle, never per participant", () => {
    expect(computeDueAmount({ priceAr: 2_500_000, minParticipants: null }, 4)).toBe(2_500_000);
  });
});

describe("meetsMinParticipants", () => {
  it("rejects a headcount below the group threshold", () => {
    expect(
      meetsMinParticipants(
        { priceAr: 2_250_000, minParticipants: 10, pricingMode: "PER_PARTICIPANT" },
        9
      )
    ).toBe(false);
  });

  it("accepts a headcount at or above the group threshold", () => {
    const plan = {
      priceAr: 2_250_000,
      minParticipants: 10,
      pricingMode: "PER_PARTICIPANT" as const,
    };
    expect(meetsMinParticipants(plan, 10)).toBe(true);
    expect(meetsMinParticipants(plan, 11)).toBe(true);
  });

  it("treats a null threshold as 1 for a group plan", () => {
    expect(
      meetsMinParticipants(
        { priceAr: 2_500_000, minParticipants: null, pricingMode: "PER_PARTICIPANT" },
        1
      )
    ).toBe(true);
  });

  it("always passes for a fixed bundle, whatever the threshold column says", () => {
    expect(
      meetsMinParticipants(
        { priceAr: 20_000_000, minParticipants: 10, pricingMode: "FIXED_BUNDLE" },
        1
      )
    ).toBe(true);
  });

  it("always passes when no pricing mode is set (treated as a fixed bundle)", () => {
    expect(meetsMinParticipants({ priceAr: 2_250_000, minParticipants: 10 }, 1)).toBe(true);
  });
});
