import { describe, expect, it } from "vitest";

import { buildServicesQuery, SERVICES_PAGE_SIZE } from "./services-query";

describe("buildServicesQuery", () => {
  it("defaults to published listings, page 1", () => {
    const query = buildServicesQuery({});
    expect(query.where).toEqual({ status: "PUBLISHED" });
    expect(query.skip).toBe(0);
    expect(query.take).toBe(SERVICES_PAGE_SIZE);
    expect(query.page).toBe(1);
  });

  it("filters by a known category", () => {
    expect(buildServicesQuery({ categorie: "Juridique & Fiscal" }).where.category).toBe(
      "Juridique & Fiscal"
    );
  });

  it("ignores an unknown category", () => {
    expect(buildServicesQuery({ categorie: "Bidon" }).where.category).toBeUndefined();
  });

  it("filters by country, falling back to the author's country when no company", () => {
    const query = buildServicesQuery({ pays: "Madagascar" });
    expect(query.where.OR).toEqual([
      { company: { country: "Madagascar" } },
      { companyId: null, author: { country: "Madagascar" } },
    ]);
  });

  it("filters by the provider's active membership tier", () => {
    const query = buildServicesQuery({ tier: "CHAIRMAN" });
    expect(query.where.author).toEqual({
      memberships: { some: { status: "ACTIVE", tier: "CHAIRMAN" } },
    });
  });

  it("ignores an unknown tier", () => {
    expect(buildServicesQuery({ tier: "BIDON" }).where.author).toBeUndefined();
  });

  it("filters by a title search", () => {
    expect(buildServicesQuery({ q: "audit" }).where.title).toEqual({
      contains: "audit",
      mode: "insensitive",
    });
  });

  it("paginates using the page param", () => {
    const query = buildServicesQuery({ page: "3" });
    expect(query.page).toBe(3);
    expect(query.skip).toBe(2 * SERVICES_PAGE_SIZE);
  });

  it("falls back to page 1 for an invalid page param", () => {
    expect(buildServicesQuery({ page: "-5" }).page).toBe(1);
  });
});
