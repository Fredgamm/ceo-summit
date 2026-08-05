import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    eventRegistration: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/event-registration-lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/event-registration-lock")>();
  return {
    ...actual,
    withEventRegistrationLock: vi.fn((_eventId: string, fn: () => Promise<unknown>) => fn()),
  };
});

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/event-registration-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/admin-event-payment-alert-email", () => ({ default: vi.fn(() => null) }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xxx") },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  withEventRegistrationLock,
  RegistrationLockBusyError,
} from "@/lib/event-registration-lock";
import { sendTransactionalEmail } from "@/lib/resend";
import { registerForEvent, cancelEventRegistration } from "./events";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "event_1",
    title: "CEO Summit 2026",
    status: "PUBLISHED",
    date: FUTURE_DATE,
    capacity: 300,
    minTier: "MEMBER",
    price: 150000,
    isOnline: false,
    location: "Saint-Denis",
    ...overrides,
  } as never;
}

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    name: "Jean-Pierre Rakoto",
    email: "jp@techocean.mg",
    company: { subscription: { status: "ACTIVE", plan: { rank: 2 } } },
    ...overrides,
  } as never;
}

describe("registerForEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eventRegistration.count).mockResolvedValue(0);
    vi.mocked(prisma.eventRegistration.create).mockResolvedValue({
      id: "reg_1",
      badgeQrCode: "qr_token_1",
    } as never);
  });

  it("confirms a free event immediately with method INCLUS and sends no admin alert", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent({ price: 0 }));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await registerForEvent("event_1");

    expect(result.success).toBe(true);
    expect(prisma.eventRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "CONFIRMED",
        paymentStatus: "PAID",
        paymentMethod: "INCLUS",
      }),
    });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1); // member email only, no admin alert
  });

  it("creates a pending registration for mobile money without alerting admin", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await registerForEvent("event_1", "MOBILE_MONEY");

    expect(result.success).toBe(true);
    expect(prisma.eventRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "PENDING_PAYMENT", paymentMethod: "MOBILE_MONEY" }),
    });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("alerts the admin when the payment method is virement", async () => {
    process.env.ADMIN_ALERT_EMAIL = "admin@ceosummit.mg";
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await registerForEvent("event_1", "VIREMENT");

    expect(result.success).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(2); // member + admin
  });

  it("rejects when no payment method is chosen for a paid event", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await registerForEvent("event_1");

    expect(result.success).toBe(false);
    expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
  });

  it("rejects when the event isn't published", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent({ status: "DRAFT" }));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await registerForEvent("event_1", "MOBILE_MONEY");
    expect(result.success).toBe(false);
  });

  it("rejects when the event date has already passed", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(
      makeEvent({ date: new Date(Date.now() - 86400000) })
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await registerForEvent("event_1", "MOBILE_MONEY");
    expect(result.success).toBe(false);
  });

  it("rejects when the viewer's tier is below the event's minTier", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent({ minTier: "CHAIRMAN" }));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await registerForEvent("event_1", "MOBILE_MONEY");
    expect(result.success).toBe(false);
  });

  it("rejects when already registered", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await registerForEvent("event_1", "MOBILE_MONEY");
    expect(result.success).toBe(false);
    expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the event is full", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent({ capacity: 10 }));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.eventRegistration.count).mockResolvedValue(10);

    const result = await registerForEvent("event_1", "MOBILE_MONEY");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/complet/i);
    expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when the registration lock is busy", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(withEventRegistrationLock).mockRejectedValueOnce(new RegistrationLockBusyError());

    const result = await registerForEvent("event_1", "MOBILE_MONEY");

    expect(result.success).toBe(false);
    expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
  });
});

describe("cancelEventRegistration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(makeEvent());
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      id: "reg_1",
      status: "CONFIRMED",
      checkedIn: false,
    } as never);
  });

  it("cancels a confirmed registration for an upcoming event", async () => {
    const result = await cancelEventRegistration("event_1");

    expect(result.success).toBe(true);
    expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: "reg_1" },
      data: { status: "CANCELLED" },
    });
  });

  it("rejects when there is no registration to cancel", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(null);

    const result = await cancelEventRegistration("event_1");

    expect(result.success).toBe(false);
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("rejects an already-cancelled registration", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      id: "reg_1",
      status: "CANCELLED",
      checkedIn: false,
    } as never);

    const result = await cancelEventRegistration("event_1");
    expect(result.success).toBe(false);
  });

  it("rejects cancelling once checked in on-site", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      id: "reg_1",
      status: "CONFIRMED",
      checkedIn: true,
    } as never);

    const result = await cancelEventRegistration("event_1");
    expect(result.success).toBe(false);
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("rejects cancelling a past event", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(
      makeEvent({ date: new Date("2020-01-01") })
    );

    const result = await cancelEventRegistration("event_1");
    expect(result.success).toBe(false);
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await cancelEventRegistration("event_1");
    expect(result.success).toBe(false);
  });
});
