import { describe, expect, it } from "vitest";

import { buildAdminMembersQuery, ADMIN_MEMBERS_PAGE_SIZE } from "./admin-members-query";

const REFERENTIALS = {
  validSectors: ["Finance & Banque"],
  validCountries: ["Madagascar"],
};

describe("buildAdminMembersQuery", () => {
  it("defaults to no filter, page 1", () => {
    const query = buildAdminMembersQuery({}, REFERENTIALS);
    expect(query.where).toEqual({});
    expect(query.skip).toBe(0);
    expect(query.take).toBe(ADMIN_MEMBERS_PAGE_SIZE);
  });

  it("filters by a known status", () => {
    expect(buildAdminMembersQuery({ statut: "SUSPENDED" }, REFERENTIALS).where.status).toBe(
      "SUSPENDED"
    );
  });

  it("ignores an unknown status", () => {
    expect(
      buildAdminMembersQuery({ statut: "ON_THE_MOON" }, REFERENTIALS).where.status
    ).toBeUndefined();
  });

  it("filters by a known country and sector", () => {
    const query = buildAdminMembersQuery(
      { pays: "Madagascar", secteur: "Finance & Banque" },
      REFERENTIALS
    );
    expect(query.where.country).toBe("Madagascar");
    expect(query.where.sectors).toEqual({ has: "Finance & Banque" });
  });

  it("builds a case-insensitive OR search across name, email and title", () => {
    const query = buildAdminMembersQuery({ q: "Rakoto" }, REFERENTIALS);
    expect(query.where.OR).toEqual([
      { name: { contains: "Rakoto", mode: "insensitive" } },
      { email: { contains: "Rakoto", mode: "insensitive" } },
      { title: { contains: "Rakoto", mode: "insensitive" } },
    ]);
  });

  it("paginates: page 3 skips two pages' worth of results", () => {
    const query = buildAdminMembersQuery({ page: "3" }, REFERENTIALS);
    expect(query.skip).toBe(ADMIN_MEMBERS_PAGE_SIZE * 2);
    expect(query.page).toBe(3);
  });

  it("clamps an invalid page to 1", () => {
    expect(buildAdminMembersQuery({ page: "-1" }, REFERENTIALS).page).toBe(1);
  });
});
