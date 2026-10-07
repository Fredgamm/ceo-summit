import { describe, expect, it } from "vitest";

import { buildBroadcastRecipientsWhere } from "./broadcast-segments";

describe("buildBroadcastRecipientsWhere", () => {
  it("scopes ALL_ACTIVE to active accounts with an active-or-expired company subscription", () => {
    expect(buildBroadcastRecipientsWhere("ALL_ACTIVE")).toEqual({
      status: "ACTIVE",
      company: { subscription: { status: { in: ["ACTIVE", "EXPIRED"] } } },
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
      company: { subscription: { status: { in: ["ACTIVE", "EXPIRED"] } } },
      country: "Madagascar",
      sectors: { has: "Énergie & Environnement" },
    });
  });

  it("leaves CUSTOM unfiltered beyond active-company scoping when no params given", () => {
    expect(buildBroadcastRecipientsWhere("CUSTOM")).toEqual({
      status: "ACTIVE",
      company: { subscription: { status: { in: ["ACTIVE", "EXPIRED"] } } },
    });
  });

  it("scopes CUSTOM to a specific Plan when planIds is given (dynamic offers, not just CHAIRMAN/EXECUTIVE)", () => {
    expect(buildBroadcastRecipientsWhere("CUSTOM", { planIds: ["plan_sponsor_or"] })).toEqual({
      status: "ACTIVE",
      company: {
        subscription: {
          status: { in: ["ACTIVE", "EXPIRED"] },
          planId: { in: ["plan_sponsor_or"] },
        },
      },
    });
  });

  it("scopes CUSTOM to several plans at once (rapport QA 1er oct. §3.2b)", () => {
    expect(buildBroadcastRecipientsWhere("CUSTOM", { planIds: ["plan_a", "plan_b"] })).toEqual({
      status: "ACTIVE",
      company: {
        subscription: {
          status: { in: ["ACTIVE", "EXPIRED"] },
          planId: { in: ["plan_a", "plan_b"] },
        },
      },
    });
  });

  it("ignores an empty planIds array, same as no filter", () => {
    expect(buildBroadcastRecipientsWhere("CUSTOM", { planIds: [] })).toEqual({
      status: "ACTIVE",
      company: { subscription: { status: { in: ["ACTIVE", "EXPIRED"] } } },
    });
  });
});
