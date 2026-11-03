import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { meetingBooking: { findUnique: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { loadMeetingCalendarInput } from "./meeting-calendar";

const person = (id: string) => ({
  id,
  name: id === "me" ? "Marie" : "Paul",
  title: "Directeur",
  phone: `+262 ${id}`,
  email: `${id}@x.re`,
  company: { name: `Société ${id}` },
});

const booking = (status: string) => ({
  id: "b1",
  status,
  reason: "Échanger sur un partenariat.",
  expiresAt: new Date("2027-01-11T05:50:00Z"),
  requesterId: "me",
  recipientId: "paul",
  slot: {
    startTime: new Date("2027-01-11T06:00:00Z"),
    endTime: new Date("2027-01-11T06:30:00Z"),
  },
  event: {
    title: "CEO Summit 2027",
    location: "Saint-Denis",
    timezone: "Indian/Reunion",
    meetingSetup: { zone: "Espace B2B", accessInstructions: "Niveau 1" },
  },
  requester: person("me"),
  recipient: person("paul"),
});

describe("loadMeetingCalendarInput", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gives each side the other participant's details, in the event time zone", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(booking("CONFIRMED") as never);
    const now = new Date("2027-01-10T08:00:00Z");

    const asRequester = await loadMeetingCalendarInput("b1", "me", now);
    const asRecipient = await loadMeetingCalendarInput("b1", "paul", now);

    expect(asRequester.ok && asRequester.input.partner.name).toBe("Paul");
    expect(asRecipient.ok && asRecipient.input.partner.name).toBe("Marie");
    expect(asRequester.ok && asRequester.input.startLabel).toContain("10h00");
    expect(asRequester.ok && asRequester.input.timezoneLabel).toContain("Réunion");
  });

  it("is still available once the meeting is over", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(booking("CONFIRMED") as never);

    const result = await loadMeetingCalendarInput("b1", "me", new Date("2027-01-12T08:00:00Z"));

    expect(result.ok).toBe(true);
  });

  it("refuses a stranger as if the meeting did not exist", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(booking("CONFIRMED") as never);
    expect(await loadMeetingCalendarInput("b1", "intruder")).toEqual({
      ok: false,
      reason: "not-found",
    });

    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(null);
    expect(await loadMeetingCalendarInput("nope", "me")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("refuses anything that is not confirmed (no phone number leaks before)", async () => {
    for (const status of ["PENDING", "DECLINED", "EXPIRED", "WITHDRAWN", "CANCELLED"]) {
      vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(booking(status) as never);
      expect(await loadMeetingCalendarInput("b1", "me", new Date("2027-01-10T08:00:00Z"))).toEqual({
        ok: false,
        reason: "not-confirmed",
      });
    }
  });
});
