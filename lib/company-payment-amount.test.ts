import { describe, expect, it } from "vitest";

import { computeDueAmount, meetsMinParticipants, seatCap } from "./company-payment-amount";

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
});
