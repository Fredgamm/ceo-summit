import { describe, expect, it } from "vitest";

import { buildCatalogueQuery, CATALOGUE_PAGE_SIZE } from "./catalogue";

const REFERENTIALS = {
  validSectors: ["Finance & Banque"],
  validCountries: ["Madagascar"],
};

describe("buildCatalogueQuery", () => {
  it("defaults to active members, most expensive offer first, page 1", () => {
    const query = buildCatalogueQuery({}, REFERENTIALS);

    expect(query.where).toEqual({ status: "ACTIVE" });
    expect(query.orderBy).toEqual({ company: { subscription: { plan: { priceAr: "desc" } } } });
    expect(query.skip).toBe(0);
    expect(query.take).toBe(CATALOGUE_PAGE_SIZE);
    expect(query.page).toBe(1);
  });

  it("filters by a known sector", () => {
    const query = buildCatalogueQuery({ secteur: "Finance & Banque" }, REFERENTIALS);
    expect(query.where.sectors).toEqual({ has: "Finance & Banque" });
  });

  it("ignores an unknown sector", () => {
    const query = buildCatalogueQuery({ secteur: "Not A Real Sector" }, REFERENTIALS);
    expect(query.where.sectors).toBeUndefined();
  });

  it("filters by a known country", () => {
    const query = buildCatalogueQuery({ pays: "Madagascar" }, REFERENTIALS);
    expect(query.where.country).toBe("Madagascar");
  });

  it("ignores an unknown country", () => {
    const query = buildCatalogueQuery({ pays: "Narnia" }, REFERENTIALS);
    expect(query.where.country).toBeUndefined();
  });

  it("filters by a known tier via the role column", () => {
    const query = buildCatalogueQuery({ tier: "EXECUTIVE" }, REFERENTIALS);
    expect(query.where.role).toBe("EXECUTIVE");
  });

  it("ignores an invalid tier", () => {
    const query = buildCatalogueQuery({ tier: "GOD_MODE" }, REFERENTIALS);
    expect(query.where.role).toBeUndefined();
  });

  it("builds a case-insensitive OR search across name, title and company name", () => {
    const query = buildCatalogueQuery({ q: "Rakoto" }, REFERENTIALS);
    expect(query.where.OR).toEqual([
      { name: { contains: "Rakoto", mode: "insensitive" } },
      { title: { contains: "Rakoto", mode: "insensitive" } },
      { company: { name: { contains: "Rakoto", mode: "insensitive" } } },
    ]);
  });

  it("ignores a blank keyword", () => {
    const query = buildCatalogueQuery({ q: "   " }, REFERENTIALS);
    expect(query.where.OR).toBeUndefined();
  });

  it("sorts alphabetically when tri=alpha", () => {
    expect(buildCatalogueQuery({ tri: "alpha" }, REFERENTIALS).orderBy).toEqual({ name: "asc" });
  });

  it("sorts by tier (role desc) when tri=tier", () => {
    expect(buildCatalogueQuery({ tri: "tier" }, REFERENTIALS).orderBy).toEqual({ role: "desc" });
  });

  it("sorts recent-first when tri=recent", () => {
    expect(buildCatalogueQuery({ tri: "recent" }, REFERENTIALS).orderBy).toEqual({
      createdAt: "desc",
    });
  });

  it("sorts by offer (most expensive plan first) when tri=offre", () => {
    expect(buildCatalogueQuery({ tri: "offre" }, REFERENTIALS).orderBy).toEqual({
      company: { subscription: { plan: { priceAr: "desc" } } },
    });
  });

  it("paginates: page 2 skips one page's worth of results", () => {
    const query = buildCatalogueQuery({ page: "2" }, REFERENTIALS);
    expect(query.skip).toBe(CATALOGUE_PAGE_SIZE);
    expect(query.page).toBe(2);
  });

  it("clamps a non-positive or invalid page to 1", () => {
    expect(buildCatalogueQuery({ page: "0" }, REFERENTIALS).page).toBe(1);
    expect(buildCatalogueQuery({ page: "-5" }, REFERENTIALS).page).toBe(1);
    expect(buildCatalogueQuery({ page: "not-a-number" }, REFERENTIALS).page).toBe(1);
  });
});
