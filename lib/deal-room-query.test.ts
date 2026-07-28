import { describe, expect, it } from "vitest";

import { allowedVisibilities, buildDealRoomQuery, DEAL_ROOM_PAGE_SIZE } from "./deal-room-query";

describe("allowedVisibilities", () => {
  it("lets a MEMBER see only MEMBER-visibility opportunities", () => {
    expect(allowedVisibilities("MEMBER")).toEqual(["MEMBER"]);
  });

  it("lets an EXECUTIVE see MEMBER and EXECUTIVE opportunities", () => {
    expect(allowedVisibilities("EXECUTIVE")).toEqual(["MEMBER", "EXECUTIVE"]);
  });

  it("lets a CHAIRMAN see everything", () => {
    expect(allowedVisibilities("CHAIRMAN")).toEqual(["MEMBER", "EXECUTIVE", "CHAIRMAN"]);
  });

  it("lets a viewer with no active membership see nothing", () => {
    expect(allowedVisibilities(null)).toEqual([]);
    expect(allowedVisibilities(undefined)).toEqual([]);
  });
});

describe("buildDealRoomQuery", () => {
  it("defaults to published opportunities visible to the viewer's tier, recent-first", () => {
    const query = buildDealRoomQuery({}, "EXECUTIVE");
    expect(query.where).toEqual({
      status: "PUBLISHED",
      visibility: { in: ["MEMBER", "EXECUTIVE"] },
    });
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.skip).toBe(0);
    expect(query.take).toBe(DEAL_ROOM_PAGE_SIZE);
  });

  it("filters by a known type", () => {
    expect(buildDealRoomQuery({ type: "INVESTISSEMENT" }, "CHAIRMAN").where.type).toBe(
      "INVESTISSEMENT"
    );
  });

  it("ignores an unknown type", () => {
    expect(buildDealRoomQuery({ type: "PIZZA" }, "CHAIRMAN").where.type).toBeUndefined();
  });

  it("filters by a known sector and country", () => {
    const query = buildDealRoomQuery(
      { sector: "Finance & Banque", pays: "Madagascar" },
      "CHAIRMAN"
    );
    expect(query.where.sector).toBe("Finance & Banque");
    expect(query.where.country).toBe("Madagascar");
  });

  it.each([
    ["lt50m", { lt: 50_000_000 }],
    ["50-200m", { gte: 50_000_000, lte: 200_000_000 }],
    ["gt200m", { gt: 200_000_000 }],
  ])("maps budget preset %s to %o", (preset, expected) => {
    expect(buildDealRoomQuery({ budget: preset }, "CHAIRMAN").where.budget).toEqual(expected);
  });

  it.each([
    ["budget_asc", { budget: "asc" }],
    ["budget_desc", { budget: "desc" }],
    ["deadline", { deadline: "asc" }],
  ])("maps sort %s to %o", (tri, expected) => {
    expect(buildDealRoomQuery({ tri }, "CHAIRMAN").orderBy).toEqual(expected);
  });

  it("paginates: page 2 skips one page's worth of results", () => {
    const query = buildDealRoomQuery({ page: "2" }, "CHAIRMAN");
    expect(query.skip).toBe(DEAL_ROOM_PAGE_SIZE);
    expect(query.page).toBe(2);
  });
});
