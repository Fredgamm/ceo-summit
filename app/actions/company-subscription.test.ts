import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    companySubscription: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    companyPayment: { create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-company-payment-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { selectPlan, submitPaymentProof, purchaseUpsellSeats } from "./company-subscription";

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

  it("rejects an inactive plan", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan_1",
      isActive: false,
    } as never);

    const result = await selectPlan("company_1", "plan_1");
    expect(result.success).toBe(false);
    expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects when a subscription is already ACTIVE", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "admin_user_1",
      subscription: { id: "sub_1", status: "ACTIVE", plan: { event: null } },
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

  it("allows re-selecting once an event-tied ACTIVE subscription's edition has passed (RG-12), persisting EXPIRED", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "admin_user_1",
      subscription: {
        id: "sub_1",
        status: "ACTIVE",
        plan: { event: { date: new Date("2020-01-01") } },
      },
    } as never);

    const result = await selectPlan("company_1", "plan_2");

    expect(result.success).toBe(true);
    expect(prisma.companySubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { status: "EXPIRED" },
    });
  });

  it("rejects switching while PENDING_REVIEW (RG-11 révisée) — must wait for the admin's decision", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "admin_user_1",
      subscription: { id: "sub_1", status: "PENDING_REVIEW", plan: { event: null } },
    } as never);

    const result = await selectPlan("company_1", "plan_2");

    expect(result.success).toBe(false);
    expect(prisma.companyPayment.updateMany).not.toHaveBeenCalled();
    expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
  });

  it("does not touch payments when switching from PENDING_PAYMENT (no proof submitted yet)", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "admin_user_1",
      subscription: { id: "sub_1", status: "PENDING_PAYMENT", plan: { event: null } },
    } as never);

    await selectPlan("company_1", "plan_2");
    expect(prisma.companyPayment.updateMany).not.toHaveBeenCalled();
  });
});

describe("submitPaymentProof", () => {
  const VALID_INPUT = {
    method: "VIREMENT" as const,
    proofFileKey: "company-payments/admin_user_1/proof.pdf",
    comment: "",
    declaredParticipants: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      companyId: "company_1",
      status: "PENDING_PAYMENT",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
      plan: { priceAr: 2_250_000, minParticipants: 10, pricingMode: "PER_PARTICIPANT" },
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined as never);
  });

  it("creates the payment (amount computed from the declared count × unit price) and flips the subscription to PENDING_REVIEW", async () => {
    const result = await submitPaymentProof("sub_1", VALID_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.companyPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 22_500_000 }) })
    );
    expect(prisma.companySubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING_REVIEW", declaredParticipants: 10 }),
      })
    );
  });

  it("rejects when the declared count is below the plan's minParticipants threshold", async () => {
    const result = await submitPaymentProof("sub_1", { ...VALID_INPUT, declaredParticipants: 3 });
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing declared count for a PER_PARTICIPANT plan", async () => {
    const withoutCount = {
      method: VALID_INPUT.method,
      proofFileKey: VALID_INPUT.proofFileKey,
      comment: VALID_INPUT.comment,
    };
    const result = await submitPaymentProof("sub_1", withoutCount);
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("bills a plan with no explicit pricing mode as a flat bundle, never per participant", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      companyId: "company_1",
      status: "PENDING_PAYMENT",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
      plan: { priceAr: 2_250_000, minParticipants: 10, pricingMode: null },
    } as never);

    const result = await submitPaymentProof("sub_1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(prisma.companyPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2_250_000 }) })
    );
  });

  it("computes a flat amount for a FIXED_BUNDLE plan, no declared count required", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      companyId: "company_1",
      status: "PENDING_PAYMENT",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
      plan: {
        priceAr: 20_000_000,
        minParticipants: null,
        pricingMode: "FIXED_BUNDLE",
        maxTeamMembers: 10,
      },
    } as never);

    const withoutCount = {
      method: VALID_INPUT.method,
      proofFileKey: VALID_INPUT.proofFileKey,
      comment: VALID_INPUT.comment,
    };
    const result = await submitPaymentProof("sub_1", withoutCount);

    expect(result.success).toBe(true);
    expect(prisma.companyPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 20_000_000 }) })
    );
    expect(prisma.companySubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ declaredParticipants: null }),
      })
    );
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

  /**
   * Correctif (7 août 2026, audit) — `proofFileKey` n'était jamais vérifié
   * comme appartenant à l'appelant avant résolution en URL signée côté admin.
   */
  it("rejects a proofFileKey that doesn't belong to the calling admin", async () => {
    const result = await submitPaymentProof("sub_1", {
      ...VALID_INPUT,
      proofFileKey: "company-payments/someone_else/proof.pdf",
    });
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("purchaseUpsellSeats", () => {
  const VALID_INPUT = {
    upsellPlanId: "plan_upsell",
    quantity: 3,
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
      status: "ACTIVE",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
      plan: { event: null },
    } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan_upsell",
      isActive: true,
      isUpsell: true,
      priceAr: 4_715_800,
    } as never);
  });

  it("creates a payment for quantity × unit price without touching the subscription status", async () => {
    const result = await purchaseUpsellSeats("sub_1", VALID_INPUT);

    expect(result.success).toBe(true);
    expect(prisma.companyPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 3 * 4_715_800,
          upsellPlanId: "plan_upsell",
          upsellQuantity: 3,
        }),
      })
    );
    expect(prisma.companySubscription.update).not.toHaveBeenCalled();
  });

  it("rejects when the subscription isn't ACTIVE or EXPIRED", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      companyId: "company_1",
      status: "PENDING_PAYMENT",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
      plan: { event: null },
    } as never);

    const result = await purchaseUpsellSeats("sub_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.companyPayment.create).not.toHaveBeenCalled();
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      id: "sub_1",
      companyId: "company_1",
      status: "ACTIVE",
      company: { companyAdminId: "someone_else", name: "Rakoto Holding" },
      plan: { event: null },
    } as never);

    const result = await purchaseUpsellSeats("sub_1", VALID_INPUT);
    expect(result.success).toBe(false);
  });

  it("rejects a plan that isn't marked isUpsell", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan_upsell",
      isActive: true,
      isUpsell: false,
      priceAr: 4_715_800,
    } as never);

    const result = await purchaseUpsellSeats("sub_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.companyPayment.create).not.toHaveBeenCalled();
  });

  it("rejects a proofFileKey that doesn't belong to the calling admin", async () => {
    const result = await purchaseUpsellSeats("sub_1", {
      ...VALID_INPUT,
      proofFileKey: "company-payments/someone_else/proof.pdf",
    });
    expect(result.success).toBe(false);
    expect(prisma.companyPayment.create).not.toHaveBeenCalled();
  });
});
