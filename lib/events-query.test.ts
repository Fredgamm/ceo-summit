import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildUpcomingEventsWhere, buildPastEventsWhere, eventCapacityBadge } from "./events-query";

const NOW = new Date("2026-07-28T00:00:00.000Z");

describe("buildUpcomingEventsWhere", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("defaults to published events on or after now", () => {
    const where = buildUpcomingEventsWhere({});
    expect(where).toEqual({ status: "PUBLISHED", date: { gte: NOW } });
  });

  it("filters by a known type", () => {
    const where = buildUpcomingEventsWhere({ type: "WEBINAIRE" });
    expect(where.type).toBe("WEBINAIRE");
  });

  it("ignores an unknown type", () => {
    const where = buildUpcomingEventsWhere({ type: "PIZZA_PARTY" });
    expect(where.type).toBeUndefined();
  });

  it("filters by a known access tier", () => {
    const where = buildUpcomingEventsWhere({ acces: "CHAIRMAN" });
    expect(where.minTier).toBe("CHAIRMAN");
  });

  it("ignores an unknown access tier", () => {
    const where = buildUpcomingEventsWhere({ acces: "VIP_UNICORN" });
    expect(where.minTier).toBeUndefined();
  });

  it('narrows the date window to the rest of the current month for date="mois"', () => {
    const where = buildUpcomingEventsWhere({ date: "mois" });
    // Calendar-month boundary is computed in local time (deliberately — "ce
    // mois" is a wall-clock concept), so the expectation must be too.
    expect(where.date).toEqual({
      gte: NOW,
      lt: new Date(NOW.getFullYear(), NOW.getMonth() + 1, 1),
    });
  });

  it('narrows the date window to the next 90 days for date="trimestre"', () => {
    const where = buildUpcomingEventsWhere({ date: "trimestre" });
    expect(where.date).toEqual({
      gte: NOW,
      lte: new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000),
    });
  });

  it("narrows the date window to a specific year", () => {
    const where = buildUpcomingEventsWhere({ date: "2026" });
    expect(where.date).toEqual({ gte: NOW, lt: new Date(2027, 0, 1) });
  });
});

describe("buildPastEventsWhere", () => {
  it("selects published or completed events strictly before now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(buildPastEventsWhere()).toEqual({
      status: { in: ["PUBLISHED", "COMPLETED"] },
      date: { lt: NOW },
    });
    vi.useRealTimers();
  });
});

describe("eventCapacityBadge", () => {
  it("returns complet when there is no room left", () => {
    expect(eventCapacityBadge(100, 100)).toBe("complet");
    expect(eventCapacityBadge(100, 105)).toBe("complet");
  });

  it("returns limite when 10 or fewer spots remain", () => {
    expect(eventCapacityBadge(100, 90)).toBe("limite");
    expect(eventCapacityBadge(100, 95)).toBe("limite");
  });

  it("returns ouvert when more than 10 spots remain", () => {
    expect(eventCapacityBadge(300, 102)).toBe("ouvert");
  });
});
