import { describe, expect, it } from "vitest";

import { offerBadgeLabel } from "./offer-badge";

describe("offerBadgeLabel", () => {
  it("returns the offer name for an active fixed-price offer", () => {
    expect(
      offerBadgeLabel({ status: "ACTIVE", plan: { name: "Gold", pricingMode: "FIXED_BUNDLE" } })
    ).toBe("Gold");
  });

  it("treats an offer without pricing mode as fixed-price", () => {
    expect(offerBadgeLabel({ status: "ACTIVE", plan: { name: "Bronze", pricingMode: null } })).toBe(
      "Bronze"
    );
  });

  it("gives no badge to a per-participant offer", () => {
    expect(
      offerBadgeLabel({
        status: "ACTIVE",
        plan: { name: "Early Bird", pricingMode: "PER_PARTICIPANT" },
      })
    ).toBeNull();
  });

  it("keeps the badge for an expired subscription (RG-12)", () => {
    expect(
      offerBadgeLabel({ status: "EXPIRED", plan: { name: "Silver", pricingMode: "FIXED_BUNDLE" } })
    ).toBe("Silver");
  });

  it("gives no badge before the payment is confirmed or without subscription", () => {
    expect(
      offerBadgeLabel({
        status: "PENDING_REVIEW",
        plan: { name: "Platinum", pricingMode: "FIXED_BUNDLE" },
      })
    ).toBeNull();
    expect(offerBadgeLabel(null)).toBeNull();
  });
});
