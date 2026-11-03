import { describe, expect, it } from "vitest";

import {
  buildMeetingIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  googleCalendarUrl,
  type MeetingCalendarInput,
} from "./meeting-ics";

// 11 janvier 2027, 10h00 à La Réunion (UTC+4) = 06h00 UTC.
const INPUT: MeetingCalendarInput = {
  bookingId: "booking_1",
  start: new Date("2027-01-11T06:00:00Z"),
  end: new Date("2027-01-11T06:30:00Z"),
  eventTitle: "CEO Summit 2027 — La Réunion",
  eventLocation: "Saint-Denis, La Réunion",
  zone: "Espace B2B, niveau 1",
  accessInstructions: "À gauche de l'accueil; présentez votre badge.",
  timezoneLabel: "heure de La Réunion",
  startLabel: "11 janvier 2027, 10h00",
  partner: {
    name: "Paul Rakoto",
    title: "Directeur général",
    companyName: "Société Océan, Indien",
    phone: "+262 692 00 00 00",
    email: "paul@x.re",
  },
  reason: "Présenter notre offre logistique\net explorer un partenariat.",
  partnerProfileUrl: "https://b2b.ceo-summit.mg/membres/user_b",
};

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

describe("buildMeetingIcs", () => {
  const ics = buildMeetingIcs(INPUT, new Date("2026-11-03T08:00:00Z"));

  it("uses CRLF line endings and ends with one (iPhone / Outlook / Apple Calendar)", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("never exceeds 75 bytes per line, accents and em dashes included", () => {
    for (const line of ics.split("\r\n")) expect(utf8Length(line)).toBeLessThanOrEqual(75);
  });

  it("writes start and end in UTC, so each device converts to its own time zone", () => {
    expect(ics).toContain("DTSTART:20270111T060000Z\r\n");
    expect(ics).toContain("DTEND:20270111T063000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261103T080000Z\r\n");
    expect(ics).not.toContain("TZID");
  });

  it("is a simple add-to-calendar file: PUBLISH, no organizer, no attendee, no RSVP", () => {
    expect(ics).toContain("METHOD:PUBLISH\r\n");
    expect(ics).not.toMatch(/ORGANIZER|ATTENDEE/);
  });

  it("has a stable UID per meeting so reopening the file updates instead of duplicating", () => {
    expect(ics).toContain("UID:meeting-booking_1@ceo-summit.mg\r\n");
  });

  it("carries the useful information, once unfolded and unescaped", () => {
    const text = ics.replace(/\r\n /g, "");
    expect(text).toContain("SUMMARY:RDV B2B — Paul Rakoto (Société Océan\\, Indien)");
    expect(text).toContain("LOCATION:Espace B2B\\, niveau 1 — Saint-Denis\\, La Réunion");
    expect(text).toContain("+262 692 00 00 00");
    expect(text).toContain("paul@x.re");
    expect(text).toContain("heure de La Réunion");
    expect(text).toContain("Présenter notre offre logistique\\net explorer un partenariat.");
    expect(text).toContain("À gauche de l'accueil\\; présentez votre badge.");
  });

  it("adds a 30-minute reminder", () => {
    expect(ics).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT30M\r\n");
  });
});

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma and line breaks (RFC 5545)", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldIcsLine", () => {
  it("leaves a short line alone", () => {
    expect(foldIcsLine("SUMMARY:court")).toBe("SUMMARY:court");
  });

  it("folds on 75 bytes with a leading space, without cutting a multibyte character", () => {
    const line = "DESCRIPTION:" + "é—".repeat(60);
    const folded = foldIcsLine(line);

    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(utf8Length(part)).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) expect(part.startsWith(" ")).toBe(true);
    // Une fois dépliée, la ligne est intacte (aucun caractère coupé ni perdu).
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("formatIcsUtc", () => {
  it("drops separators and milliseconds", () => {
    expect(formatIcsUtc(new Date("2027-01-11T06:00:00.123Z"))).toBe("20270111T060000Z");
  });
});

describe("googleCalendarUrl", () => {
  it("opens Google Agenda with the UTC range, title and place", () => {
    const url = new URL(googleCalendarUrl(INPUT));

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20270111T060000Z/20270111T063000Z");
    expect(url.searchParams.get("text")).toBe("RDV B2B — Paul Rakoto (Société Océan, Indien)");
    expect(url.searchParams.get("location")).toContain("Espace B2B");
    expect(url.searchParams.get("details")).toContain("+262 692 00 00 00");
  });
});
