import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    companySubscription: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    companyPayment: { create: vi.fn() },
    user: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-company-payment-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { selectPlan, submitPaymentProof } from "./company-subscription";

const SESSION = { user: { id: "admin_user_1" } } as never;

describe("selectPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "admin_user_1",
      subscription: null,
    } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan_1",
      isActive: true,
      scope: "COMPANY",
    } as never);
  });

  it("upserts a PENDING_PAYMENT subscription", async () => {
    const result = await selectPlan("company_1", "plan_1");
    expect(result.success).toBe(true);
    expect(prisma.companySubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "company_1" },
        create: expect.objectContaining({ planId: "plan_1", status: "PENDING_PAYMENT" }),
      })
    );
  });

  it("rejects a non-COMPANY-scope plan", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan_1",
      isActive: true,
      scope: "INDIVIDUAL",
    } as never);

    const result = await selectPlan("company_1", "plan_1");
    expect(result.success).toBe(false);
    expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects when a subscription is already ACTIVE", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "admin_user_1",
      subscription: { status: "ACTIVE" },
    } as never);

    const result = await selectPlan("company_1", "plan_1");
    expect(result.success).toBe(false);
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "someone_else",
      subscription: null,
    } as never);

    const result = await selectPlan("company_1", "plan_1");
    expect(result.success).toBe(false);
  });
});

describe("submitPaymentProof", () => {
  const VALID_INPUT = {
    method: "VIREMENT" as const,
    proofFileKey: "company-payments/admin_user_1/proof.pdf",
    comment: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      companyId: "company_1",
      status: "PENDING_PAYMENT",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
      plan: { priceAr: 2_250_000, minParticipants: 10 },
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(10);
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined as never);
  });

  it("creates the payment (amount computed from headcount × unit price) and flips the subscription to PENDING_REVIEW", async () => {
    const result = await submitPaymentProof("sub_1", VALID_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.companyPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 22_500_000 }) })
    );
  });

  it("rejects when headcount is below the plan's minParticipants threshold", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(3);

    const result = await submitPaymentProof("sub_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when the subscription isn't PENDING_PAYMENT", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      status: "PENDING_REVIEW",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
      plan: { priceAr: 2_250_000, minParticipants: 10 },
    } as never);

    const result = await submitPaymentProof("sub_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      status: "PENDING_PAYMENT",
      company: { companyAdminId: "someone_else", name: "Rakoto Holding" },
      plan: { priceAr: 2_250_000, minParticipants: 10 },
    } as never);

    const result = await submitPaymentProof("sub_1", VALID_INPUT);
    expect(result.success).toBe(false);
  });

  it("rejects invalid input", async () => {
    const result = await submitPaymentProof("sub_1", { ...VALID_INPUT, method: "INVALID" });
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
