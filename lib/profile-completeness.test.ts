import { describe, expect, it } from "vitest";

import { profileCompleteness } from "./profile-completeness";

const EMPTY = {
  title: null,
  bio: null,
  avatarUrl: null,
  websiteUrl: null,
  linkedinUrl: null,
  phone: null,
  country: null,
  companyId: null,
  sectors: [],
};

describe("profileCompleteness", () => {
  it("returns 0 when nothing is filled in", () => {
    expect(profileCompleteness(EMPTY)).toBe(0);
  });

  it("returns 100 when every tracked field is filled in", () => {
    expect(
      profileCompleteness({
        title: "CEO",
        bio: "Some bio",
        avatarUrl: "https://example.com/a.png",
        websiteUrl: "https://example.mg",
        linkedinUrl: "https://linkedin.com/in/x",
        phone: "+261 34 00 000 00",
        country: "Madagascar",
        companyId: "company_1",
        sectors: ["Finance"],
      })
    ).toBe(100);
  });

  it("rounds to the nearest percent for a partial profile", () => {
    // 4 of 9 fields filled ≈ 44%
    expect(
      profileCompleteness({
        ...EMPTY,
        title: "CEO",
        bio: "Bio",
        country: "Madagascar",
        phone: "0340000000",
      })
    ).toBe(44);
  });

  it("counts an empty sectors array as unfilled but a non-empty one as filled", () => {
    expect(profileCompleteness({ ...EMPTY, sectors: [] }).valueOf()).toBe(0);
    expect(profileCompleteness({ ...EMPTY, sectors: ["Finance"] })).toBe(11);
  });
});
