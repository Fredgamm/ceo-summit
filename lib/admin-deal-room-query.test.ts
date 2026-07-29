import { describe, expect, it } from "vitest";

import { buildActiveOpportunitiesWhere } from "./admin-deal-room-query";

describe("buildActiveOpportunitiesWhere", () => {
  it("always scopes to PUBLISHED with no filters", () => {
    expect(buildActiveOpportunitiesWhere({})).toEqual({ status: "PUBLISHED" });
  });

  it("filters by title search", () => {
    expect(buildActiveOpportunitiesWhere({ q: "solaire" }).title).toEqual({
      contains: "solaire",
      mode: "insensitive",
    });
  });

  it("filters by a known type", () => {
    expect(buildActiveOpportunitiesWhere({ type: "INVESTISSEMENT" }).type).toBe("INVESTISSEMENT");
  });

  it("ignores an unknown type", () => {
    expect(buildActiveOpportunitiesWhere({ type: "BIDON" }).type).toBeUndefined();
  });

  it("filters by a known sector", () => {
    expect(buildActiveOpportunitiesWhere({ sector: "Énergie & Environnement" }).sector).toBe(
      "Énergie & Environnement"
    );
  });

  it("ignores an unknown sector", () => {
    expect(buildActiveOpportunitiesWhere({ sector: "Bidon" }).sector).toBeUndefined();
  });
});
