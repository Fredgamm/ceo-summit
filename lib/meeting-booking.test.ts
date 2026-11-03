import { describe, expect, it } from "vitest";

import {
  canSeeMeetingContact,
  matchesMeetingFilter,
  normalizeResponseMessage,
  meetingDisplayStatus,
  meetingRequestExpiry,
} from "./meeting-booking";

const REUNION = "Indian/Reunion";
// Créneau jeudi 11 mars 2027, 14h00 à La Réunion = 10h00 UTC.
const SLOT = new Date("2027-03-11T10:00:00Z");

describe("meetingRequestExpiry (RG-06, D13)", () => {
  it("same day: expires at the slot's start", () => {
    // jeudi 11h00 La Réunion
    expect(meetingRequestExpiry(new Date("2027-03-11T07:00:00Z"), SLOT, REUNION)).toEqual(SLOT);
    // jeudi 13h45
    expect(meetingRequestExpiry(new Date("2027-03-11T09:45:00Z"), SLOT, REUNION)).toEqual(SLOT);
  });

  it("the day before: 10 minutes before the slot when that comes before 48 h", () => {
    // mercredi 18h00 La Réunion → jeudi 13h50
    expect(meetingRequestExpiry(new Date("2027-03-10T14:00:00Z"), SLOT, REUNION)).toEqual(
      new Date("2027-03-11T09:50:00Z")
    );
  });

  it("several days before: 48 hours after sending", () => {
    // lundi 10h00 La Réunion → mercredi 10h00
    expect(meetingRequestExpiry(new Date("2027-03-08T06:00:00Z"), SLOT, REUNION)).toEqual(
      new Date("2027-03-10T06:00:00Z")
    );
  });

  it("judges « same day » in the event's timezone, not UTC", () => {
    // jeudi 01h00 à La Réunion = mercredi 21h00 UTC : c'est le jour même.
    expect(meetingRequestExpiry(new Date("2027-03-10T21:00:00Z"), SLOT, REUNION)).toEqual(SLOT);
  });
});

describe("meetingDisplayStatus (lots 5 et 8)", () => {
  const NOW = new Date("2027-03-10T08:00:00Z");
  const later = new Date("2027-03-11T10:30:00Z");
  const earlier = new Date("2027-03-09T10:30:00Z");

  it("shows a pending request past its deadline as expired (RG-06, at read time)", () => {
    expect(meetingDisplayStatus({ status: "PENDING", expiresAt: later, endTime: later }, NOW)).toBe(
      "PENDING"
    );
    expect(
      meetingDisplayStatus({ status: "PENDING", expiresAt: earlier, endTime: later }, NOW)
    ).toBe("EXPIRED");
  });

  it("computes « terminé » from the end of the slot (D5)", () => {
    expect(
      meetingDisplayStatus({ status: "CONFIRMED", expiresAt: earlier, endTime: later }, NOW)
    ).toBe("CONFIRMED");
    expect(
      meetingDisplayStatus({ status: "CONFIRMED", expiresAt: earlier, endTime: earlier }, NOW)
    ).toBe("COMPLETED");
  });

  it("keeps the other statuses as they are", () => {
    expect(
      meetingDisplayStatus({ status: "DECLINED", expiresAt: earlier, endTime: later }, NOW)
    ).toBe("DECLINED");
  });
});

describe("canSeeMeetingContact (RG-04)", () => {
  it("only for a confirmed or completed meeting", () => {
    expect(canSeeMeetingContact("CONFIRMED")).toBe(true);
    expect(canSeeMeetingContact("COMPLETED")).toBe(true);
    for (const s of ["PENDING", "DECLINED", "EXPIRED", "WITHDRAWN", "CANCELLED"] as const) {
      expect(canSeeMeetingContact(s)).toBe(false);
    }
  });
});

describe("matchesMeetingFilter (P5, D16)", () => {
  it("« À venir » holds pending requests and confirmed meetings not yet over", () => {
    expect(matchesMeetingFilter("PENDING", "upcoming")).toBe(true);
    expect(matchesMeetingFilter("CONFIRMED", "upcoming")).toBe(true);
    expect(matchesMeetingFilter("COMPLETED", "upcoming")).toBe(false);
    expect(matchesMeetingFilter("EXPIRED", "upcoming")).toBe(false);
  });

  it("« Passés » holds completed meetings, « Tous » everything", () => {
    expect(matchesMeetingFilter("COMPLETED", "past")).toBe(true);
    expect(matchesMeetingFilter("CONFIRMED", "past")).toBe(false);
    expect(matchesMeetingFilter("WITHDRAWN", "all")).toBe(true);
  });
});

describe("normalizeResponseMessage (le mot facultatif en répondant)", () => {
  it("is optional: nothing, blanks or null mean no word", () => {
    expect(normalizeResponseMessage(undefined)).toEqual({ ok: true, message: null });
    expect(normalizeResponseMessage(null)).toEqual({ ok: true, message: null });
    expect(normalizeResponseMessage("   \n ")).toEqual({ ok: true, message: null });
  });

  it("trims the word", () => {
    expect(normalizeResponseMessage("  Avec plaisir !  ")).toEqual({
      ok: true,
      message: "Avec plaisir !",
    });
  });

  it("accepts exactly 300 characters, refuses 301", () => {
    expect(normalizeResponseMessage("x".repeat(300)).ok).toBe(true);
    expect(normalizeResponseMessage("x".repeat(301))).toEqual({
      ok: false,
      error: "Votre message ne doit pas dépasser 300 caractères.",
    });
  });

  it("refuses anything that is not text", () => {
    expect(normalizeResponseMessage(42)).toEqual({ ok: false, error: "Message invalide." });
    expect(normalizeResponseMessage({ text: "x" }).ok).toBe(false);
  });
});
