import { describe, expect, it } from "vitest";

import {
  allowedVisibilities,
  buildDealRoomQuery,
  DEAL_ROOM_PAGE_SIZE,
  isDefaultSort,
  sortByCompanyRelevance,
} from "./deal-room-query";

const REFERENTIALS = {
  validTypes: [
    "Partenariat",
    "Investissement",
    "Appel à offres",
    "Levée de fonds",
    "Joint-venture",
  ],
  validSectors: ["Finance & Banque"],
  validCountries: ["Madagascar"],
};

/**
 * Décision d'architecture (sept. 2026, conception/09) — accès égal pour tout
 * membre dont l'entreprise a une offre active/validée : toute opportunité
 * publiée est visible dès qu'un tier existe, plus seulement à son rang.
 */
describe("allowedVisibilities", () => {
  it("lets any tier see every visibility level", () => {
    expect(allowedVisibilities("MEMBER")).toEqual(["MEMBER", "EXECUTIVE", "CHAIRMAN"]);
    expect(allowedVisibilities("EXECUTIVE")).toEqual(["MEMBER", "EXECUTIVE", "CHAIRMAN"]);
    expect(allowedVisibilities("CHAIRMAN")).toEqual(["MEMBER", "EXECUTIVE", "CHAIRMAN"]);
  });

  it("lets a viewer with no active membership see nothing", () => {
    expect(allowedVisibilities(null)).toEqual([]);
    expect(allowedVisibilities(undefined)).toEqual([]);
  });
});

describe("buildDealRoomQuery", () => {
  it("defaults to every published opportunity, recent-first", () => {
    const query = buildDealRoomQuery({}, "EXECUTIVE", REFERENTIALS);
    expect(query.where).toEqual({
      status: "PUBLISHED",
      visibility: { in: ["MEMBER", "EXECUTIVE", "CHAIRMAN"] },
    });
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.skip).toBe(0);
    expect(query.take).toBe(DEAL_ROOM_PAGE_SIZE);
  });

  it("filters by a known type", () => {
    expect(
      buildDealRoomQuery({ type: "Investissement" }, "CHAIRMAN", REFERENTIALS).where.type
    ).toBe("Investissement");
  });

  it("ignores an unknown type", () => {
    expect(
      buildDealRoomQuery({ type: "PIZZA" }, "CHAIRMAN", REFERENTIALS).where.type
    ).toBeUndefined();
  });

  it("filters by a known sector and country", () => {
    const query = buildDealRoomQuery(
      { sector: "Finance & Banque", pays: "Madagascar" },
      "CHAIRMAN",
      REFERENTIALS
    );
    expect(query.where.sector).toBe("Finance & Banque");
    expect(query.where.country).toBe("Madagascar");
  });

  it.each([
    ["lt50m", { lt: 50_000_000 }],
    ["50-200m", { gte: 50_000_000, lte: 200_000_000 }],
    ["gt200m", { gt: 200_000_000 }],
  ])("maps budget preset %s to %o", (preset, expected) => {
    expect(buildDealRoomQuery({ budget: preset }, "CHAIRMAN", REFERENTIALS).where.budget).toEqual(
      expected
    );
  });

  it.each([
    ["budget_asc", { budget: "asc" }],
    ["budget_desc", { budget: "desc" }],
    ["deadline", { deadline: "asc" }],
  ])("maps sort %s to %o", (tri, expected) => {
    expect(buildDealRoomQuery({ tri }, "CHAIRMAN", REFERENTIALS).orderBy).toEqual(expected);
  });

  it("paginates: page 2 skips one page's worth of results", () => {
    const query = buildDealRoomQuery({ page: "2" }, "CHAIRMAN", REFERENTIALS);
    expect(query.skip).toBe(DEAL_ROOM_PAGE_SIZE);
    expect(query.page).toBe(2);
  });
});

/** Rapport QA du 1er oct. 2026 (§2.4) — "mes opportunités d'abord", puis même secteur. */
describe("isDefaultSort", () => {
  it("treats no tri, or an unknown tri, as the default", () => {
    expect(isDefaultSort({})).toBe(true);
    expect(isDefaultSort({ tri: "n'importe quoi" })).toBe(true);
  });

  it("treats budget/deadline sorts as explicit, not default", () => {
    expect(isDefaultSort({ tri: "budget_asc" })).toBe(false);
    expect(isDefaultSort({ tri: "budget_desc" })).toBe(false);
    expect(isDefaultSort({ tri: "deadline" })).toBe(false);
  });
});

describe("sortByCompanyRelevance", () => {
  const other = { id: "other", authorCompanyId: "company-other", authorCompanySector: "Tourisme" };
  const sameSector = {
    id: "same-sector",
    authorCompanyId: "company-2",
    authorCompanySector: "Finance & Banque",
  };
  const mine = {
    id: "mine",
    authorCompanyId: "company-1",
    authorCompanySector: "Finance & Banque",
  };

  it("puts the viewer's own company first, then same-sector, then the rest", () => {
    const sorted = sortByCompanyRelevance(
      [other, mine, sameSector],
      "company-1",
      "Finance & Banque"
    );
    expect(sorted.map((o) => o.id)).toEqual(["mine", "same-sector", "other"]);
  });

  it("is stable: equal-score items keep their input order", () => {
    const otherA = { id: "a", authorCompanyId: "x", authorCompanySector: "Tourisme" };
    const otherB = { id: "b", authorCompanyId: "y", authorCompanySector: "Logistique" };
    const sorted = sortByCompanyRelevance([otherA, otherB], "company-1", "Finance & Banque");
    expect(sorted.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("falls back to sector-only ranking when the viewer has no company", () => {
    const sorted = sortByCompanyRelevance([other, sameSector], null, "Finance & Banque");
    expect(sorted.map((o) => o.id)).toEqual(["same-sector", "other"]);
  });

  it("leaves order unchanged when the viewer has neither a company nor a sector", () => {
    const sorted = sortByCompanyRelevance([other, mine, sameSector], null, null);
    expect(sorted.map((o) => o.id)).toEqual(["other", "mine", "same-sector"]);
  });
});
