import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    companyPayment: { findUnique: vi.fn(), update: vi.fn() },
    companySubscription: { update: vi.fn() },
    company: { update: vi.fn() },
    user: { findUnique: vi.fn() },
    eventRegistration: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/company-payment-confirmed-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/company-payment-rejected-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  confirmCompanyPayment,
  rejectCompanyPayment,
  reassignCompanyAdmin,
} from "./admin-companies";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const PAYMENT_BASE = {
  id: "payment_1",
  status: "PENDING",
  companySubscriptionId: "sub_1",
  companySubscription: {
    companyId: "company_1",
    plan: { id: "plan_1", eventId: null },
    company: {
      name: "Rakoto Holding",
      companyAdmin: { name: "Marie Dupont", email: "marie@example.mg" },
      users: [{ id: "user_1" }, { id: "user_2" }],
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

describe("confirmCompanyPayment", () => {
  it("confirms the payment and activates the subscription", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    const result = await confirmCompanyPayment("payment_1");

    expect(result.success).toBe(true);
    expect(prisma.companySubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "company_payment.confirm" }),
      })
    );
  });

  it("rejects an already-processed payment", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      status: "CONFIRMED",
    } as never);

    const result = await confirmCompanyPayment("payment_1");
    expect(result.success).toBe(false);
    expect(prisma.companySubscription.update).not.toHaveBeenCalled();
  });

  it("registers every current company member to the linked event when the plan is event-scoped", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      companySubscription: {
        ...PAYMENT_BASE.companySubscription,
        plan: { id: "plan_1", eventId: "event_1" },
      },
    } as never);

    await confirmCompanyPayment("payment_1");

    expect(prisma.eventRegistration.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.eventRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: "event_1", userId: "user_1" } },
        create: expect.objectContaining({ eventId: "event_1", userId: "user_1", planId: "plan_1" }),
      })
    );
  });

  it("does not touch EventRegistration for a standard (non-event) plan", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    await confirmCompanyPayment("payment_1");
    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
  });
});

describe("rejectCompanyPayment", () => {
  it("rejects the payment with a reason and reverts the subscription to PENDING_PAYMENT", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    const result = await rejectCompanyPayment("payment_1", "Preuve illisible");

    expect(result.success).toBe(true);
    expect(prisma.companySubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PENDING_PAYMENT" } })
    );
  });

  it("requires a non-empty reason", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    const result = await rejectCompanyPayment("payment_1", "   ");
    expect(result.success).toBe(false);
    expect(prisma.companySubscription.update).not.toHaveBeenCalled();
  });
});

describe("reassignCompanyAdmin", () => {
  it("reassigns when the target is a member of the company", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_2",
      companyId: "company_1",
    } as never);

    const result = await reassignCompanyAdmin("company_1", "user_2");
    expect(result.success).toBe(true);
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company_1" },
      data: { companyAdminId: "user_2" },
    });
  });

  it("rejects a target who isn't a member of the company", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_2",
      companyId: "other_company",
    } as never);

    const result = await reassignCompanyAdmin("company_1", "user_2");
    expect(result.success).toBe(false);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});
