import { describe, expect, it } from "vitest";

import {
  availableUntilFromDay,
  availableUntilToDay,
  isPlanAvailable,
  planUnavailableMessage,
} from "./plan-availability";

describe("availableUntilFromDay", () => {
  it("keeps the offer available until the end of that day in the event's timezone", () => {
    // 31 déc. 2026 23:59:59.999 à La Réunion (UTC+4) = 19:59:59.999 UTC.
    expect(availableUntilFromDay("2026-12-31", "Indian/Reunion")?.toISOString()).toBe(
      "2026-12-31T19:59:59.999Z"
    );
    // Madagascar (UTC+3) à défaut.
    expect(availableUntilFromDay("2027-02-28")?.toISOString()).toBe("2027-02-28T20:59:59.999Z");
  });

  it("means no limit when left empty", () => {
    expect(availableUntilFromDay("")).toBeNull();
    expect(availableUntilFromDay(null)).toBeNull();
  });

  it("round-trips to the day shown in the admin form", () => {
    const until = availableUntilFromDay("2026-12-31", "Indian/Reunion");
    expect(availableUntilToDay(until, "Indian/Reunion")).toBe("2026-12-31");
  });
});

describe("isPlanAvailable", () => {
  const until = new Date("2026-12-31T19:59:59.999Z");

  it("is available up to and including the limit, not after", () => {
    expect(isPlanAvailable({ availableUntil: until }, new Date("2026-12-31T19:59:59.999Z"))).toBe(
      true
    );
    expect(isPlanAvailable({ availableUntil: until }, new Date("2026-12-31T20:00:00Z"))).toBe(
      false
    );
  });

  it("is always available without a limit", () => {
    expect(isPlanAvailable({ availableUntil: null })).toBe(true);
  });

  it("names the offer and the date in the refusal", () => {
    expect(planUnavailableMessage({ name: "Early Bird**", availableUntil: until })).toBe(
      "L'offre « Early Bird » n'est plus disponible depuis le 31 décembre 2026. Choisissez une autre offre."
    );
  });
});
