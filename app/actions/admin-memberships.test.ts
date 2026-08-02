import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    membershipPayment: { findUnique: vi.fn(), update: vi.fn() },
    membership: { update: vi.fn() },
    user: { update: vi.fn() },
    creditBalance: { upsert: vi.fn() },
    eventRegistration: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/membership-payment-confirmed-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/membership-payment-rejected-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { confirmMembershipPayment, rejectMembershipPayment } from "./admin-memberships";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const PAYMENT_BASE = {
  id: "payment_1",
  status: "PENDING",
  membershipId: "membership_1",
  membership: {
    id: "membership_1",
    userId: "user_1",
    user: { name: "Jean Rakoto", email: "jean@example.mg" },
    plan: {
      id: "plan_1",
      name: "Executive pass",
      includedCredits: 10,
      hasUnlimitedCredits: false,
      eventId: null,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
    const list = ops as Promise<unknown>[];
    return Promise.all(list);
  });
});

describe("confirmMembershipPayment", () => {
  it("confirms the payment, activates the membership and grants included credits", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    const result = await confirmMembershipPayment("payment_1");

    expect(result.success).toBe(true);
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "membership_1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
    expect(prisma.creditBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ included: 10 }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "membership_payment.confirm" }),
      })
    );
  });

  it("grants unlimited credits for a hasUnlimitedCredits plan", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      membership: {
        ...PAYMENT_BASE.membership,
        plan: { ...PAYMENT_BASE.membership.plan, hasUnlimitedCredits: true },
      },
    } as never);

    await confirmMembershipPayment("payment_1");
    expect(prisma.creditBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ included: 999999 }) })
    );
  });

  it("rejects an already-processed payment", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      status: "CONFIRMED",
    } as never);

    const result = await confirmMembershipPayment("payment_1");
    expect(result.success).toBe(false);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("registers the buyer to the linked event when the plan is event-scoped", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      membership: {
        ...PAYMENT_BASE.membership,
        plan: { ...PAYMENT_BASE.membership.plan, eventId: "event_1" },
      },
    } as never);

    await confirmMembershipPayment("payment_1");
    expect(prisma.eventRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: "event_1", userId: "user_1" } },
        create: expect.objectContaining({ eventId: "event_1", userId: "user_1", planId: "plan_1" }),
      })
    );
  });

  it("does not touch EventRegistration for a standard (non-event) plan", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    await confirmMembershipPayment("payment_1");
    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
  });
});

describe("rejectMembershipPayment", () => {
  it("rejects the payment with a reason and reverts the membership to PENDING_PAYMENT", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    const result = await rejectMembershipPayment("payment_1", "Preuve illisible");

    expect(result.success).toBe(true);
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "membership_1" },
      data: { status: "PENDING_PAYMENT" },
    });
  });

  it("rejects an empty reason", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    const result = await rejectMembershipPayment("payment_1", "   ");
    expect(result.success).toBe(false);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("rejects an already-processed payment", async () => {
    vi.mocked(prisma.membershipPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      status: "REJECTED",
    } as never);

    const result = await rejectMembershipPayment("payment_1", "Motif");
    expect(result.success).toBe(false);
  });
});
