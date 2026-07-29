import { describe, expect, it } from "vitest";

import { buildBroadcastRecipientsWhere } from "./broadcast-segments";

describe("buildBroadcastRecipientsWhere", () => {
  it("scopes ALL_ACTIVE to active accounts with an active membership", () => {
    expect(buildBroadcastRecipientsWhere("ALL_ACTIVE")).toEqual({
      status: "ACTIVE",
      memberships: { some: { status: "ACTIVE" } },
    });
  });

  it("scopes CHAIRMAN to active Chairman members only", () => {
    expect(buildBroadcastRecipientsWhere("CHAIRMAN")).toEqual({
      status: "ACTIVE",
      memberships: { some: { status: "ACTIVE", tier: "CHAIRMAN" } },
    });
  });

  it("scopes EXECUTIVE to active Executive members only", () => {
    expect(buildBroadcastRecipientsWhere("EXECUTIVE")).toEqual({
      status: "ACTIVE",
      memberships: { some: { status: "ACTIVE", tier: "EXECUTIVE" } },
    });
  });

  it("filters CUSTOM by country and sector when provided", () => {
    expect(
      buildBroadcastRecipientsWhere("CUSTOM", {
        country: "Madagascar",
        sector: "Énergie & Environnement",
      })
    ).toEqual({
      status: "ACTIVE",
      memberships: { some: { status: "ACTIVE" } },
      country: "Madagascar",
      sectors: { has: "Énergie & Environnement" },
    });
  });

  it("leaves CUSTOM unfiltered beyond active-member scoping when no params given", () => {
    expect(buildBroadcastRecipientsWhere("CUSTOM")).toEqual({
      status: "ACTIVE",
      memberships: { some: { status: "ACTIVE" } },
    });
  });
});
