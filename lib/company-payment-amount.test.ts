import { describe, expect, it } from "vitest";

import { computeDueAmount, meetsMinParticipants } from "./company-payment-amount";

describe("computeDueAmount", () => {
  it("multiplies the per-participant price by headcount", () => {
    expect(computeDueAmount({ priceAr: 2_250_000, minParticipants: 10 }, 12)).toBe(27_000_000);
  });

  it("returns the flat price for a single-person plan", () => {
    expect(computeDueAmount({ priceAr: 2_500_000, minParticipants: null }, 1)).toBe(2_500_000);
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
});
