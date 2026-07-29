import { describe, expect, it } from "vitest";

import {
  parseMembershipPrices,
  parseIncludedCredits,
  membershipPriceKey,
  creditsIncludedKey,
  DEFAULT_MEMBERSHIP_PRICES,
  DEFAULT_INCLUDED_CREDITS,
} from "./platform-settings";

describe("parseMembershipPrices", () => {
  it("falls back to defaults when no rows exist", () => {
    expect(parseMembershipPrices([])).toEqual(DEFAULT_MEMBERSHIP_PRICES);
  });

  it("reads real values when present", () => {
    const result = parseMembershipPrices([
      { key: "membership_price_member", value: "250000" },
      { key: "membership_price_executive", value: "650000" },
      { key: "membership_price_chairman", value: "1600000" },
    ]);
    expect(result).toEqual({ MEMBER: 250000, EXECUTIVE: 650000, CHAIRMAN: 1600000 });
  });

  it("falls back per-tier when a value is missing or unparsable", () => {
    const result = parseMembershipPrices([
      { key: "membership_price_member", value: "250000" },
      { key: "membership_price_executive", value: "not-a-number" },
    ]);
    expect(result).toEqual({
      MEMBER: 250000,
      EXECUTIVE: DEFAULT_MEMBERSHIP_PRICES.EXECUTIVE,
      CHAIRMAN: DEFAULT_MEMBERSHIP_PRICES.CHAIRMAN,
    });
  });
});

describe("parseIncludedCredits", () => {
  it("falls back to defaults when no rows exist", () => {
    expect(parseIncludedCredits([])).toEqual(DEFAULT_INCLUDED_CREDITS);
  });

  it("reads real values when present", () => {
    const result = parseIncludedCredits([
      { key: "credits_included_member", value: "2" },
      { key: "credits_included_executive", value: "15" },
    ]);
    expect(result).toEqual({ MEMBER: 2, EXECUTIVE: 15 });
  });
});

describe("key helpers", () => {
  it("builds the expected setting keys", () => {
    expect(membershipPriceKey("CHAIRMAN")).toBe("membership_price_chairman");
    expect(creditsIncludedKey("EXECUTIVE")).toBe("credits_included_executive");
  });
});
