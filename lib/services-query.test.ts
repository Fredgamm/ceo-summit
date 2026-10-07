import { describe, expect, it } from "vitest";

import { buildServicesQuery, SERVICES_PAGE_SIZE } from "./services-query";

const VALID_COUNTRIES = ["Madagascar"];

describe("buildServicesQuery", () => {
  it("defaults to published listings, page 1", () => {
    const query = buildServicesQuery({}, VALID_COUNTRIES);
    expect(query.where).toEqual({ status: "PUBLISHED" });
    expect(query.skip).toBe(0);
    expect(query.take).toBe(SERVICES_PAGE_SIZE);
    expect(query.page).toBe(1);
  });

  it("filters by a known category", () => {
    expect(
      buildServicesQuery({ categorie: "Juridique & Fiscal" }, VALID_COUNTRIES).where.category
    ).toBe("Juridique & Fiscal");
  });

  it("ignores an unknown category", () => {
    expect(
      buildServicesQuery({ categorie: "Bidon" }, VALID_COUNTRIES).where.category
    ).toBeUndefined();
  });

  it("filters by country, falling back to the author's country when no company", () => {
    const query = buildServicesQuery({ pays: "Madagascar" }, VALID_COUNTRIES);
    expect(query.where.OR).toEqual([
      { company: { country: "Madagascar" } },
      { companyId: null, author: { country: "Madagascar" } },
    ]);
  });

  it("filters by a title search", () => {
    expect(buildServicesQuery({ q: "audit" }, VALID_COUNTRIES).where.title).toEqual({
      contains: "audit",
      mode: "insensitive",
    });
  });

  it("paginates using the page param", () => {
    const query = buildServicesQuery({ page: "3" }, VALID_COUNTRIES);
    expect(query.page).toBe(3);
    expect(query.skip).toBe(2 * SERVICES_PAGE_SIZE);
  });

  it("falls back to page 1 for an invalid page param", () => {
    expect(buildServicesQuery({ page: "-5" }, VALID_COUNTRIES).page).toBe(1);
  });
});
