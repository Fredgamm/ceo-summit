import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn(), update: vi.fn() },
    eventRegistration: { findMany: vi.fn(), updateMany: vi.fn() },
    companySubscription: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/evolia", () => ({ pushParticipantsToEvolia: vi.fn() }));
vi.mock("@/lib/event-participation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/event-participation")>();
  return {
    ...actual,
    registerCompanyMemberToEvent: vi.fn(),
    sendEventRegistrationEmail: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import { pushParticipantsToEvolia } from "@/lib/evolia";
import {
  registerCompanyMemberToEvent,
  sendEventRegistrationEmail,
} from "@/lib/event-participation";
import { autoRegisterCompanyMembers, syncPlanEventRegistrations } from "./event-auto-registration";

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const EVENT = {
  title: "CEO Summit",
  date: FUTURE,
  timezone: "Indian/Reunion",
  isOnline: false,
  location: "Saint-Denis",
};

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: "company_1",
    companyAdminId: "manager",
    adminParticipates: false,
    subscription: {
      status: "ACTIVE",
      declaredParticipants: null,
      extraSeats: 0,
      memberLimit: null,
      plan: {
        id: "plan_1",
        eventId: "event_1",
        pricingMode: "FIXED_BUNDLE",
        maxTeamMembers: 3,
        event: EVENT,
      },
    },
    // Ordre d'arrivée : a, manager, b, c, d
    users: ["a", "manager", "b", "c", "d"].map((id) => ({ id, name: id, email: `${id}@x.mg` })),
    ...overrides,
  };
}

describe("autoRegisterCompanyMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.company.findUnique).mockResolvedValue(company() as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([]);
    vi.mocked(registerCompanyMemberToEvent).mockResolvedValue({
      registration: {},
      event: EVENT,
      wasConfirmed: false,
    } as never);
  });

  it("registers within the offer's seats, the manager first then by arrival date", async () => {
    const result = await autoRegisterCompanyMembers("company_1", "test");

    expect(result).toEqual({ registered: 3, full: 0 });
    expect(vi.mocked(registerCompanyMemberToEvent).mock.calls.map((c) => c[0])).toEqual([
      "manager",
      "a",
      "b",
    ]);
    expect(sendEventRegistrationEmail).toHaveBeenCalledTimes(3);
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company_1" },
      data: { adminParticipates: true },
    });
    expect(pushParticipantsToEvolia).toHaveBeenCalledWith("company_1");
  });

  it("only fills the seats left, and never re-registers a member the manager removed", async () => {
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { userId: "manager", status: "CONFIRMED" },
      { userId: "a", status: "CANCELLED" }, // retiré par le gérant
    ] as never);

    await autoRegisterCompanyMembers("company_1", "test");

    expect(vi.mocked(registerCompanyMemberToEvent).mock.calls.map((c) => c[0])).toEqual(["b", "c"]);
  });

  it("does nothing when every seat is taken", async () => {
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue(
      ["manager", "a", "b"].map((userId) => ({ userId, status: "CONFIRMED" })) as never
    );

    const result = await autoRegisterCompanyMembers("company_1", "test");

    expect(result).toEqual({ registered: 0, full: 0 });
    expect(registerCompanyMemberToEvent).not.toHaveBeenCalled();
    expect(pushParticipantsToEvolia).not.toHaveBeenCalled();
  });

  it("does nothing when the offer is not active or not linked to an event", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({
        subscription: { ...company().subscription, status: "PENDING_PAYMENT" },
      }) as never
    );
    await autoRegisterCompanyMembers("company_1", "test");

    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({
        subscription: {
          ...company().subscription,
          plan: { ...company().subscription.plan, eventId: null },
        },
      }) as never
    );
    await autoRegisterCompanyMembers("company_1", "test");

    expect(registerCompanyMemberToEvent).not.toHaveBeenCalled();
  });

  it("counts members it could not register when the event is full", async () => {
    vi.mocked(registerCompanyMemberToEvent).mockResolvedValue(null);

    const result = await autoRegisterCompanyMembers("company_1", "test");

    expect(result).toEqual({ registered: 0, full: 3 });
    expect(sendEventRegistrationEmail).not.toHaveBeenCalled();
  });
});

describe("syncPlanEventRegistrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.company.findUnique).mockResolvedValue(company() as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([]);
    vi.mocked(registerCompanyMemberToEvent).mockResolvedValue({
      registration: {},
      event: EVENT,
      wasConfirmed: false,
    } as never);
    vi.mocked(prisma.companySubscription.findMany).mockResolvedValue([
      { companyId: "company_1" },
    ] as never);
  });

  it("re-saving an offer on the same event registers forgotten members, cancelling nothing", async () => {
    const result = await syncPlanEventRegistrations("plan_1", "event_1", "event_1");

    expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ registered: 3 });
  });

  it("does nothing for an offer not linked to any event", async () => {
    await syncPlanEventRegistrations("plan_1", null, null);

    expect(prisma.companySubscription.findMany).not.toHaveBeenCalled();
  });

  it("cancels the offer's registrations on the previous event, then registers on the new one", async () => {
    const result = await syncPlanEventRegistrations("plan_1", "event_old", "event_1");

    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event_old", planId: "plan_1", status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });
    expect(result).toEqual({ registered: 3 });
  });
});
