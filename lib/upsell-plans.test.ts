import { describe, expect, it } from "vitest";

import { isUpsellEligible, UPSELL_ELIGIBLE_WHERE } from "./upsell-plans";

describe("isUpsellEligible", () => {
  it("accepts a plan explicitly marked isUpsell", () => {
    expect(isUpsellEligible({ isUpsell: true, pricingMode: "FIXED_BUNDLE" })).toBe(true);
  });

  it("accepts a Groupement plan automatically, even without the isUpsell flag", () => {
    expect(isUpsellEligible({ isUpsell: false, pricingMode: "PER_PARTICIPANT" })).toBe(true);
  });

  it("rejects a fixed-bundle plan that isn't marked isUpsell", () => {
    expect(isUpsellEligible({ isUpsell: false, pricingMode: "FIXED_BUNDLE" })).toBe(false);
  });

  it("rejects a plan with no pricing mode set and no isUpsell flag", () => {
    expect(isUpsellEligible({ isUpsell: false, pricingMode: null })).toBe(false);
  });
});

describe("isUpsellEligible — active and self-service only", () => {
  it("rejects a sponsoring plan (not self-service) even if marked isUpsell", () => {
    expect(isUpsellEligible({ isUpsell: true, isSelfService: false, isActive: true })).toBe(false);
  });

  it("rejects a deactivated Groupement plan", () => {
    expect(
      isUpsellEligible({ isUpsell: false, pricingMode: "PER_PARTICIPANT", isActive: false })
    ).toBe(false);
  });

  it("accepts an active self-service supplement", () => {
    expect(isUpsellEligible({ isUpsell: true, isSelfService: true, isActive: true })).toBe(true);
  });
});

describe("UPSELL_ELIGIBLE_WHERE", () => {
  it("restricts to active, self-service plans that are upsell or Groupement", () => {
    expect(UPSELL_ELIGIBLE_WHERE).toEqual({
      isActive: true,
      isSelfService: true,
      OR: [{ isUpsell: true }, { pricingMode: "PER_PARTICIPANT" }],
    });
  });
});
