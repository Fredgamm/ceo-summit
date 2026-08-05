import { describe, expect, it } from "vitest";

import { buildActiveOpportunitiesWhere } from "./admin-deal-room-query";

const REFERENTIALS = {
  validTypes: [
    "Partenariat",
    "Investissement",
    "Appel à offres",
    "Levée de fonds",
    "Joint-venture",
  ],
  validSectors: ["Énergie & Environnement", "Finance & Banque"],
};

describe("buildActiveOpportunitiesWhere", () => {
  it("always scopes to PUBLISHED with no filters", () => {
    expect(buildActiveOpportunitiesWhere({}, REFERENTIALS)).toEqual({ status: "PUBLISHED" });
  });

  it("filters by title search", () => {
    expect(buildActiveOpportunitiesWhere({ q: "solaire" }, REFERENTIALS).title).toEqual({
      contains: "solaire",
      mode: "insensitive",
    });
  });

  it("filters by a known type", () => {
    expect(buildActiveOpportunitiesWhere({ type: "Investissement" }, REFERENTIALS).type).toBe(
      "Investissement"
    );
  });

  it("ignores an unknown type", () => {
    expect(buildActiveOpportunitiesWhere({ type: "BIDON" }, REFERENTIALS).type).toBeUndefined();
  });

  it("filters by a known sector", () => {
    expect(
      buildActiveOpportunitiesWhere({ sector: "Énergie & Environnement" }, REFERENTIALS).sector
    ).toBe("Énergie & Environnement");
  });

  it("ignores an unknown sector", () => {
    expect(buildActiveOpportunitiesWhere({ sector: "Bidon" }, REFERENTIALS).sector).toBeUndefined();
  });
});
