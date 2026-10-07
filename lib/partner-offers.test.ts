import { describe, expect, it } from "vitest";

import { isPartnerOffer, partnershipEndDate } from "./partner-offers";

const PARTNER = { isActive: true, isSelfService: false, isUpsell: false, priceAr: 0 };

describe("isPartnerOffer", () => {
  it("accepts an active, free offer not offered at sign-up", () => {
    expect(isPartnerOffer(PARTNER)).toBe(true);
  });

  it("rejects a paid, self-service, upsell or inactive offer", () => {
    expect(isPartnerOffer({ ...PARTNER, priceAr: 1000 })).toBe(false);
    expect(isPartnerOffer({ ...PARTNER, isSelfService: true })).toBe(false);
    expect(isPartnerOffer({ ...PARTNER, isUpsell: true })).toBe(false);
    expect(isPartnerOffer({ ...PARTNER, isActive: false })).toBe(false);
  });
});

describe("partnershipEndDate", () => {
  it("ends one year after activation", () => {
    expect(partnershipEndDate(new Date("2026-10-08T10:00:00Z"))).toEqual(
      new Date("2027-10-08T10:00:00Z")
    );
  });
});
