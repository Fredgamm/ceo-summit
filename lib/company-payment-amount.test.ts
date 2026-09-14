import { describe, expect, it } from "vitest";

import { computeDueAmount, meetsMinParticipants, seatCap } from "./company-payment-amount";

const GROUP_BRACKETS = [
  { minParticipants: 10, maxParticipants: 29, unitPriceAr: 650 },
  { minParticipants: 30, maxParticipants: null, unitPriceAr: 500 },
];

describe("computeDueAmount", () => {
  it("multiplies the per-participant price by the declared count (legacy, no pricingMode)", () => {
    expect(computeDueAmount({ priceAr: 2_250_000, minParticipants: 10 }, 12)).toBe(27_000_000);
  });

  it("returns the flat price for a single-person plan", () => {
    expect(computeDueAmount({ priceAr: 2_500_000, minParticipants: null }, 1)).toBe(2_500_000);
  });

  it("multiplies by the declared count for an explicit PER_PARTICIPANT plan", () => {
    expect(
      computeDueAmount(
        { priceAr: 2_250_000, minParticipants: 10, pricingMode: "PER_PARTICIPANT" },
        10
      )
    ).toBe(22_500_000);
  });

  it("returns the flat bundle price for a FIXED_BUNDLE plan, ignoring the declared count", () => {
    expect(
      computeDueAmount(
        {
          priceAr: 20_000_000,
          minParticipants: null,
          pricingMode: "FIXED_BUNDLE",
          includedSeats: 10,
        },
        3
      )
    ).toBe(20_000_000);
  });

  it("uses the unit price of the bracket reached for a TIERED_GROUP plan", () => {
    const plan = {
      priceAr: 0,
      minParticipants: null,
      pricingMode: "TIERED_GROUP" as const,
      priceBrackets: GROUP_BRACKETS,
    };
    expect(computeDueAmount(plan, 12)).toBe(12 * 650);
    expect(computeDueAmount(plan, 29)).toBe(29 * 650);
    expect(computeDueAmount(plan, 30)).toBe(30 * 500);
    expect(computeDueAmount(plan, 100)).toBe(100 * 500);
  });

  it("returns 0 for a TIERED_GROUP plan below the lowest bracket", () => {
    const plan = {
      priceAr: 0,
      minParticipants: null,
      pricingMode: "TIERED_GROUP" as const,
      priceBrackets: GROUP_BRACKETS,
    };
    expect(computeDueAmount(plan, 5)).toBe(0);
  });
});

describe("meetsMinParticipants", () => {
  it("rejects a headcount below the threshold", () => {
    expect(meetsMinParticipants({ priceAr: 2_250_000, minParticipants: 10 }, 9)).toBe(false);
  });

  it("accepts a headcount at or above the threshold", () => {
    expect(meetsMinParticipants({ priceAr: 2_250_000, minParticipants: 10 }, 10)).toBe(true);
    expect(meetsMinParticipants({ priceAr: 2_250_000, minParticipants: 10 }, 11)).toBe(true);
  });

  it("treats a null threshold as 1 (any headcount qualifies)", () => {
    expect(meetsMinParticipants({ priceAr: 2_500_000, minParticipants: null }, 1)).toBe(true);
  });

  it("always passes for a FIXED_BUNDLE plan regardless of the declared count", () => {
    expect(
      meetsMinParticipants(
        { priceAr: 20_000_000, minParticipants: 10, pricingMode: "FIXED_BUNDLE" },
        1
      )
    ).toBe(true);
  });

  it("rejects a TIERED_GROUP plan below the lowest bracket", () => {
    expect(
      meetsMinParticipants(
        {
          priceAr: 0,
          minParticipants: null,
          pricingMode: "TIERED_GROUP",
          priceBrackets: GROUP_BRACKETS,
        },
        9
      )
    ).toBe(false);
  });

  it("accepts a TIERED_GROUP plan within any bracket, including the open-ended one", () => {
    const plan = {
      priceAr: 0,
      minParticipants: null,
      pricingMode: "TIERED_GROUP" as const,
      priceBrackets: GROUP_BRACKETS,
    };
    expect(meetsMinParticipants(plan, 10)).toBe(true);
    expect(meetsMinParticipants(plan, 30)).toBe(true);
    expect(meetsMinParticipants(plan, 1000)).toBe(true);
  });
});

describe("seatCap", () => {
  it("returns includedSeats for a FIXED_BUNDLE plan", () => {
    expect(
      seatCap({
        priceAr: 20_000_000,
        minParticipants: null,
        pricingMode: "FIXED_BUNDLE",
        includedSeats: 10,
      })
    ).toBe(10);
  });

  it("returns null for a PER_PARTICIPANT plan (no mode-specific cap)", () => {
    expect(
      seatCap({ priceAr: 2_250_000, minParticipants: 10, pricingMode: "PER_PARTICIPANT" })
    ).toBeNull();
  });

  it("returns null when pricingMode is absent (legacy)", () => {
    expect(seatCap({ priceAr: 2_250_000, minParticipants: 10 })).toBeNull();
  });

  it("returns null for a TIERED_GROUP plan (no mode-specific cap)", () => {
    expect(
      seatCap({
        priceAr: 0,
        minParticipants: null,
        pricingMode: "TIERED_GROUP",
        priceBrackets: GROUP_BRACKETS,
      })
    ).toBeNull();
  });
});
