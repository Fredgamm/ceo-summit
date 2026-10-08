import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    eventRegistration: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { meetingEventIdFor, missingMeetingProfileFields } from "./meeting-participation";

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
