import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/evolia", () => ({ pushParticipantsToEvolia: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/event-participation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/event-participation")>();
  return {
    ...actual,
    registerCompanyMemberToEvent: vi.fn(),
    sendEventRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn(), update: vi.fn() },
    companySubscription: { update: vi.fn() },
    eventRegistration: { findMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { pushParticipantsToEvolia } from "@/lib/evolia";
import {
  registerCompanyMemberToEvent,
  sendEventRegistrationEmail,
} from "@/lib/event-participation";
import { validateEventParticipants } from "./company-participants";

const EVENT = {
  title: "CEO Summit 2026",
  date: new Date("2099-11-15T09:00:00Z"),
  isOnline: false,
  location: "Tana",
};

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: "company_1",
    companyAdminId: "manager_1",
    users: [
      { id: "manager_1", name: "Marie", email: "marie@test.local" },
      { id: "user_2", name: "Jean", email: "jean@test.local" },
      { id: "user_3", name: "Paul", email: "paul@test.local" },
    ],
    subscription: {
      id: "sub_1",
      status: "ACTIVE",
      declaredParticipants: null,
      extraSeats: 0,
      memberLimit: null,
      plan: {
        id: "plan_1",
        eventId: "event_1",
        event: EVENT,
        pricingMode: "FIXED_BUNDLE",
        maxTeamMembers: 2,
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireViewer).mockResolvedValue({
    success: true,
    viewer: { id: "manager_1" },
  } as never);
  vi.mocked(prisma.company.findUnique).mockResolvedValue(company() as never);
  vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([]);
  vi.mocked(registerCompanyMemberToEvent).mockResolvedValue({
    registration: {},
    event: EVENT,
    wasConfirmed: false,
  } as never);
});

describe("validateEventParticipants", () => {
  it("registers the selected members, emails them and pushes the list to Evolia", async () => {
    const result = await validateEventParticipants("company_1", ["manager_1", "user_2"]);

    expect(result).toEqual({ success: true, data: { registered: 2, removed: 0 } });
    expect(registerCompanyMemberToEvent).toHaveBeenCalledWith("user_2", "event_1", "plan_1");
    expect(sendEventRegistrationEmail).toHaveBeenCalledTimes(2);
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company_1" },
      data: { adminParticipates: true },
    });
    expect(prisma.companySubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { participantsValidatedAt: expect.any(Date) },
    });
    expect(pushParticipantsToEvolia).toHaveBeenCalledWith("company_1");
  });

  it("cancels the registration of members removed from the list", async () => {
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { userId: "user_2" },
      { userId: "user_3" },
    ] as never);

    const result = await validateEventParticipants("company_1", ["user_2"]);

    expect(result).toMatchObject({ success: true, data: { removed: 1 } });
    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event_1", userId: { in: ["user_3"] } },
      data: { status: "CANCELLED" },
    });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company_1" },
      data: { adminParticipates: false },
    });
  });

  it("does not re-email a member already registered", async () => {
    vi.mocked(registerCompanyMemberToEvent).mockResolvedValue({
      registration: {},
      event: EVENT,
      wasConfirmed: true,
    } as never);

    const result = await validateEventParticipants("company_1", ["user_2"]);

    expect(result).toMatchObject({ success: true, data: { registered: 0 } });
    expect(sendEventRegistrationEmail).not.toHaveBeenCalled();
  });

  it("refuses more participants than the offer's seats", async () => {
    const result = await validateEventParticipants("company_1", ["manager_1", "user_2", "user_3"]);

    expect(result.success).toBe(false);
    expect(registerCompanyMemberToEvent).not.toHaveBeenCalled();
    expect(pushParticipantsToEvolia).not.toHaveBeenCalled();
  });

  it("refuses someone who isn't an active member of the company", async () => {
    const result = await validateEventParticipants("company_1", ["outsider"]);
    expect(result.success).toBe(false);
  });

  it("refuses a caller who isn't the manager", async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      success: true,
      viewer: { id: "user_2" },
    } as never);

    const result = await validateEventParticipants("company_1", ["user_2"]);
    expect(result.success).toBe(false);
  });

  it("refuses while the offer isn't active or has no event", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({
        subscription: { ...company().subscription, status: "PENDING_REVIEW" },
      }) as never
    );

    const result = await validateEventParticipants("company_1", ["user_2"]);
    expect(result.success).toBe(false);
  });

  it("warns when the event is full for some participants", async () => {
    vi.mocked(registerCompanyMemberToEvent).mockResolvedValue(null);

    const result = await validateEventParticipants("company_1", ["user_2"]);

    expect(result).toMatchObject({ success: true, warning: expect.stringContaining("Jean") });
  });
});
