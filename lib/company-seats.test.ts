import { describe, expect, it } from "vitest";

import { seatCap } from "./company-seats";

describe("seatCap", () => {
  it("returns the plan's seat count plus purchased extra seats for a fixed bundle", () => {
    expect(
      seatCap({
        plan: { pricingMode: "FIXED_BUNDLE", maxTeamMembers: 2 },
        declaredParticipants: null,
        extraSeats: 3,
      })
    ).toBe(5);
  });

  it("returns the declared count plus extra seats for a group offer", () => {
    expect(
      seatCap({
        plan: { pricingMode: "PER_PARTICIPANT", maxTeamMembers: null },
        declaredParticipants: 12,
        extraSeats: 0,
      })
    ).toBe(12);
  });

  it("returns null when the plan has no seat count set", () => {
    expect(
      seatCap({
        plan: { pricingMode: "FIXED_BUNDLE", maxTeamMembers: null },
        declaredParticipants: null,
        extraSeats: 0,
      })
    ).toBeNull();
  });

  it("treats a missing pricing mode as a fixed bundle", () => {
    expect(
      seatCap({
        plan: { pricingMode: null, maxTeamMembers: 4 },
        declaredParticipants: null,
        extraSeats: 1,
      })
    ).toBe(5);
  });
});
