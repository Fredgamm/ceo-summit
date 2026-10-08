import { describe, expect, it } from "vitest";

import { buildSlotGrid, eventDayKeys, timeToMinutes } from "./meeting-slots";
import { formatTimeInZone } from "./event-timezone";

const REUNION = "Indian/Reunion";

function hours(result: ReturnType<typeof buildSlotGrid>) {
  if (!result.ok) throw new Error(result.error);
  return result.slots.map((s) => formatTimeInZone(s.startTime, REUNION));
}

describe("timeToMinutes", () => {
  it("parses HH:mm", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("9h30")).toBeNull();
  });
});

describe("eventDayKeys", () => {
  it("lists every day of the event in its timezone", () => {
    expect(
      eventDayKeys(new Date("2027-03-12T05:00:00Z"), new Date("2027-03-14T14:00:00Z"), REUNION)
    ).toEqual(["2027-03-12", "2027-03-13", "2027-03-14"]);
  });

  it("uses the start day alone when there is no end", () => {
    expect(eventDayKeys(new Date("2027-03-12T05:00:00Z"), null, REUNION)).toEqual(["2027-03-12"]);
  });

  it("follows the event's calendar day, not UTC", () => {
    // 01h30 à La Réunion le 12 = 21h30 UTC le 11.
    expect(eventDayKeys(new Date("2027-03-11T21:30:00Z"), null, REUNION)).toEqual(["2027-03-12"]);
  });
});

describe("buildSlotGrid", () => {
  const base = {
    days: ["2027-03-12"],
    dayStart: "09:00",
    dayEnd: "11:00",
    durationMinutes: 30,
    timeZone: REUNION,
  };

  it("cuts the day into consecutive slots in the event's timezone", () => {
    const result = buildSlotGrid(base);
    expect(hours(result)).toEqual(["09h00", "09h30", "10h00", "10h30"]);
    if (result.ok) {
      expect(result.slots[0].startTime.toISOString()).toBe("2027-03-12T05:00:00.000Z");
      expect(result.slots[0].endTime.toISOString()).toBe("2027-03-12T05:30:00.000Z");
    }
  });

  it("skips slots overlapping the pause", () => {
    const result = buildSlotGrid({
      ...base,
      dayEnd: "15:00",
      durationMinutes: 60,
      pauseStart: "12:30",
      pauseEnd: "14:00",
    });
    expect(hours(result)).toEqual(["09h00", "10h00", "11h00", "14h00"]);
  });

  it("drops a last slot that would overflow the range", () => {
    expect(hours(buildSlotGrid({ ...base, dayEnd: "10:45" }))).toEqual(["09h00", "09h30", "10h00"]);
  });

  it("repeats the grid on each chosen day, sorted and without duplicates", () => {
    const result = buildSlotGrid({ ...base, days: ["2027-03-13", "2027-03-12", "2027-03-12"] });
    expect(result.ok && result.slots.length).toBe(8);
  });

  it("rejects inconsistent input", () => {
    expect(buildSlotGrid({ ...base, dayEnd: "08:00" }).ok).toBe(false);
    expect(buildSlotGrid({ ...base, durationMinutes: 25 }).ok).toBe(false);
    expect(buildSlotGrid({ ...base, days: [] }).ok).toBe(false);
    expect(buildSlotGrid({ ...base, pauseStart: "10:00", pauseEnd: "" }).ok).toBe(false);
    expect(buildSlotGrid({ ...base, dayEnd: "09:15" }).ok).toBe(false);
  });

  it("refuses an oversized grid", () => {
    const days = Array.from({ length: 20 }, (_, i) => `2027-03-${String(i + 1).padStart(2, "0")}`);
    const result = buildSlotGrid({
      ...base,
      days,
      dayStart: "00:00",
      dayEnd: "23:45",
      durationMinutes: 15,
    });
    expect(result.ok).toBe(false);
  });
});
