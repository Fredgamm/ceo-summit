import { describe, expect, it } from "vitest";

import {
  formatDayKey,
  formatTimeInZone,
  formatTimeRangeInZone,
  isEventTimezone,
  offsetMinutes,
  timezoneLabel,
  toZonedIso,
  utcToZonedLocal,
  zonedDayKey,
  zonedLocalToUtc,
} from "./event-timezone";

describe("zonedLocalToUtc", () => {
  it("reads a datetime-local value in the event's timezone, whatever the server timezone", () => {
    expect(zonedLocalToUtc("2027-03-12T14:00", "Indian/Reunion")?.toISOString()).toBe(
      "2027-03-12T10:00:00.000Z"
    );
    expect(zonedLocalToUtc("2027-03-12T14:00", "Indian/Antananarivo")?.toISOString()).toBe(
      "2027-03-12T11:00:00.000Z"
    );
  });

  it("handles a day change across UTC", () => {
    expect(zonedLocalToUtc("2027-03-12T01:30", "Indian/Reunion")?.toISOString()).toBe(
      "2027-03-11T21:30:00.000Z"
    );
  });

  it("follows daylight saving time (Paris)", () => {
    expect(zonedLocalToUtc("2027-01-15T10:00", "Europe/Paris")?.toISOString()).toBe(
      "2027-01-15T09:00:00.000Z"
    );
    expect(zonedLocalToUtc("2027-07-15T10:00", "Europe/Paris")?.toISOString()).toBe(
      "2027-07-15T08:00:00.000Z"
    );
  });

  it("rejects malformed input", () => {
    expect(zonedLocalToUtc("", "Indian/Reunion")).toBeNull();
    expect(zonedLocalToUtc("12/03/2027 14:00", "Indian/Reunion")).toBeNull();
  });
});

describe("utcToZonedLocal / zonedDayKey (round-trip for edit forms)", () => {
  it("gives back the value the admin typed", () => {
    const instant = zonedLocalToUtc("2027-03-12T14:00", "Indian/Reunion")!;
    expect(utcToZonedLocal(instant, "Indian/Reunion")).toBe("2027-03-12T14:00");
  });

  it("groups by the event's calendar day, not the UTC day", () => {
    const instant = new Date("2027-03-11T21:30:00Z");
    expect(zonedDayKey(instant, "Indian/Reunion")).toBe("2027-03-12");
    expect(zonedDayKey(instant, "UTC")).toBe("2027-03-11");
  });
});

describe("display helpers", () => {
  const instant = new Date("2027-03-12T10:00:00Z");

  it("formats hours in the event's timezone", () => {
    expect(formatTimeInZone(instant, "Indian/Reunion")).toBe("14h00");
    expect(formatTimeInZone(instant, "Indian/Antananarivo")).toBe("13h00");
    expect(formatTimeRangeInZone(instant, new Date("2027-03-12T10:30:00Z"), "Indian/Reunion")).toBe(
      "14h00 – 14h30"
    );
  });

  it("formats a day key in French", () => {
    expect(formatDayKey("2027-03-12")).toBe("12 mars 2027");
  });

  it("labels the timezone", () => {
    expect(timezoneLabel("Indian/Reunion")).toBe("heure de La Réunion");
    expect(timezoneLabel("Asia/Tokyo")).toBe("heure locale (Asia/Tokyo)");
  });

  it("writes ISO 8601 with the event's offset (Evolia)", () => {
    expect(toZonedIso(instant, "Indian/Reunion")).toBe("2027-03-12T14:00:00+04:00");
    expect(toZonedIso(instant, "Indian/Antananarivo")).toBe("2027-03-12T13:00:00+03:00");
    expect(offsetMinutes(instant, "Europe/Paris")).toBe(60);
  });

  it("only accepts listed timezones", () => {
    expect(isEventTimezone("Indian/Reunion")).toBe(true);
    expect(isEventTimezone("Mars/Olympus")).toBe(false);
  });
});
