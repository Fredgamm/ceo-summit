import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    eventRegistration: { findUnique: vi.fn() },
    event: { findFirst: vi.fn() },
    meetingBooking: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  loadMemberMeetingView,
  meetingEventIdFor,
  missingMeetingProfileFields,
} from "./meeting-participation";

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);

function member(
  overrides: { status?: string; subStatus?: string; type?: string; eventId?: string | null } = {}
) {
  return {
    status: overrides.status ?? "ACTIVE",
    company: {
      subscription: {
        status: overrides.subStatus ?? "ACTIVE",
        plan: {
          id: "plan_1",
          eventId: overrides.eventId === undefined ? "evt_1" : overrides.eventId,
          event: { date: FUTURE, type: overrides.type ?? "SUMMIT" },
        },
      },
    },
  };
}

describe("meetingEventIdFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member() as never);
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      status: "CONFIRMED",
      planId: "plan_1",
    } as never);
  });

  it("returns the Summit of the member's active offer when registered through it", async () => {
    expect(await meetingEventIdFor("user_1")).toBe("evt_1");
  });

  it("refuses an event that is not a « Summit annuel »", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member({ type: "RENCONTRE" }) as never);
    expect(await meetingEventIdFor("user_1")).toBeNull();
  });

  it("refuses an offer that is not active, or not linked to an event", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      member({ subStatus: "PENDING_PAYMENT" }) as never
    );
    expect(await meetingEventIdFor("user_1")).toBeNull();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member({ eventId: null }) as never);
    expect(await meetingEventIdFor("user_1")).toBeNull();
  });

  it("refuses an inactive account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member({ status: "SUSPENDED" }) as never);
    expect(await meetingEventIdFor("user_1")).toBeNull();
  });

  it("refuses a member removed from the list, or registered another way", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      status: "CANCELLED",
      planId: "plan_1",
    } as never);
    expect(await meetingEventIdFor("user_1")).toBeNull();

    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      status: "CONFIRMED",
      planId: null,
    } as never);
    expect(await meetingEventIdFor("user_1")).toBeNull();
  });
});

describe("missingMeetingProfileFields", () => {
  it("lists the missing minimum profile fields (RG-02)", () => {
    expect(
      missingMeetingProfileFields({ name: "Marie", email: "m@x.mg", phone: " ", companyId: null })
    ).toEqual(["entreprise", "téléphone"]);
  });
});

describe("loadMemberMeetingView (visitor side, lot 4)", () => {
  const PROFILE = { name: "Paul", email: "p@x.mg", phone: "+262", companyId: "c" };
  const slot = (id: string, hoursFromNow: number, statuses: Record<string, string>) => ({
    id,
    startTime: new Date(Date.now() + hoursFromNow * 3600 * 1000),
    endTime: new Date(Date.now() + (hoursFromNow + 0.5) * 3600 * 1000),
    participantSlots: Object.entries(statuses).map(([userId, status]) => ({ userId, status })),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Éligibilité (select.status) puis profil du membre visité.
    vi.mocked(prisma.user.findUnique).mockImplementation(((args: {
      select: { status?: boolean };
    }) => Promise.resolve(args.select.status ? member() : PROFILE)) as never);
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      status: "CONFIRMED",
      planId: "plan_1",
    } as never);
    vi.mocked(prisma.meetingBooking.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      id: "evt_1",
      title: "CEO Summit",
      timezone: "Indian/Reunion",
      meetingSetup: { zone: "Espace B2B" },
      meetingSlots: [
        slot("past", -1, {}), // triés par heure, comme la requête
        slot("free", 48, {}), // libre par défaut
        slot("taken", 49, { member: "PENDING" }),
        slot("hidden", 50, { member: "INACTIVE" }),
        slot("busy", 51, { visitor: "BOOKED" }),
      ],
    } as never);
  });

  it("shows free slots, greys taken ones, hides deactivated ones", async () => {
    const view = await loadMemberMeetingView("visitor", "member");

    const states = view!.days.flatMap((d) => d.slots.map((s) => [s.id, s.state]));
    expect(states).toEqual([
      ["past", "past"],
      ["free", "available"],
      ["taken", "taken"],
      ["busy", "you-unavailable"],
    ]);
    expect(view!.memberUnavailable).toBe(false);
  });

  it("is not shown on one's own profile, nor when one of them is not a participant", async () => {
    expect(await loadMemberMeetingView("member", "member")).toBeNull();

    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(null);
    expect(await loadMemberMeetingView("visitor", "member")).toBeNull();
  });
});
