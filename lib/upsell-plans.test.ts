import { describe, expect, it } from "vitest";

import { isUpsellEligible } from "./upsell-plans";

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
