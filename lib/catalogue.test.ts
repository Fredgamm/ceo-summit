import { describe, expect, it } from "vitest";

import { buildCatalogueQuery, CATALOGUE_PAGE_SIZE } from "./catalogue";

describe("buildCatalogueQuery", () => {
  it("defaults to active members, recent-first, page 1", () => {
    const query = buildCatalogueQuery({});

    expect(query.where).toEqual({ status: "ACTIVE" });
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.skip).toBe(0);
    expect(query.take).toBe(CATALOGUE_PAGE_SIZE);
    expect(query.page).toBe(1);
  });

  it("filters by a known sector", () => {
    const query = buildCatalogueQuery({ secteur: "Finance & Banque" });
    expect(query.where.sectors).toEqual({ has: "Finance & Banque" });
  });

  it("ignores an unknown sector", () => {
    const query = buildCatalogueQuery({ secteur: "Not A Real Sector" });
    expect(query.where.sectors).toBeUndefined();
  });

  it("filters by a known country", () => {
    const query = buildCatalogueQuery({ pays: "Madagascar" });
    expect(query.where.country).toBe("Madagascar");
  });

  it("ignores an unknown country", () => {
    const query = buildCatalogueQuery({ pays: "Narnia" });
    expect(query.where.country).toBeUndefined();
  });

  it("filters by a known tier via the role column", () => {
    const query = buildCatalogueQuery({ tier: "EXECUTIVE" });
    expect(query.where.role).toBe("EXECUTIVE");
  });

  it("ignores an invalid tier", () => {
    const query = buildCatalogueQuery({ tier: "GOD_MODE" });
    expect(query.where.role).toBeUndefined();
  });

  it("builds a case-insensitive OR search across name, title and company name", () => {
    const query = buildCatalogueQuery({ q: "Rakoto" });
    expect(query.where.OR).toEqual([
      { name: { contains: "Rakoto", mode: "insensitive" } },
      { title: { contains: "Rakoto", mode: "insensitive" } },
      { company: { name: { contains: "Rakoto", mode: "insensitive" } } },
    ]);
  });

  it("ignores a blank keyword", () => {
    const query = buildCatalogueQuery({ q: "   " });
    expect(query.where.OR).toBeUndefined();
  });

  it("sorts alphabetically when tri=alpha", () => {
    expect(buildCatalogueQuery({ tri: "alpha" }).orderBy).toEqual({ name: "asc" });
  });

  it("sorts by tier (role desc) when tri=tier", () => {
    expect(buildCatalogueQuery({ tri: "tier" }).orderBy).toEqual({ role: "desc" });
  });

  it("paginates: page 2 skips one page's worth of results", () => {
    const query = buildCatalogueQuery({ page: "2" });
    expect(query.skip).toBe(CATALOGUE_PAGE_SIZE);
    expect(query.page).toBe(2);
  });

  it("clamps a non-positive or invalid page to 1", () => {
    expect(buildCatalogueQuery({ page: "0" }).page).toBe(1);
    expect(buildCatalogueQuery({ page: "-5" }).page).toBe(1);
    expect(buildCatalogueQuery({ page: "not-a-number" }).page).toBe(1);
  });
});
