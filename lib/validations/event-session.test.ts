import { describe, expect, it } from "vitest";

import { eventSessionFormSchema } from "./event-session";

const VALID_INPUT = {
  title: "Table ronde : Investissement & Capital",
  description: "",
  room: "Salle plénière",
  startTime: "2026-11-24T14:30",
  endTime: "2026-11-24T15:30",
  speakersText: "",
};

describe("eventSessionFormSchema", () => {
  it("accepts a valid session", () => {
    const result = eventSessionFormSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a title that's too short", () => {
    const result = eventSessionFormSchema.safeParse({ ...VALID_INPUT, title: "Hi" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty room", () => {
    const result = eventSessionFormSchema.safeParse({ ...VALID_INPUT, room: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an end time before the start time", () => {
    const result = eventSessionFormSchema.safeParse({
      ...VALID_INPUT,
      startTime: "2026-11-24T15:30",
      endTime: "2026-11-24T14:30",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an end time equal to the start time", () => {
    const result = eventSessionFormSchema.safeParse({
      ...VALID_INPUT,
      startTime: "2026-11-24T14:30",
      endTime: "2026-11-24T14:30",
    });
    expect(result.success).toBe(false);
  });

  it("allows two sessions to share the same time slot (parallel rooms) — no cross-row constraint here", () => {
    const a = eventSessionFormSchema.safeParse({ ...VALID_INPUT, room: "Salle plénière" });
    const b = eventSessionFormSchema.safeParse({ ...VALID_INPUT, room: "Salle B" });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
  });
});
