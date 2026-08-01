import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    plan: { findFirst: vi.fn() },
    membership: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    membershipPayment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-membership-payment-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { selectIndividualPlan, submitMembershipPaymentProof } from "./membership-subscription";

const SESSION = { user: { id: "user_1" } } as never;

describe("selectIndividualPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: null,
      memberships: [],
    } as never);
    vi.mocked(prisma.plan.findFirst).mockResolvedValue({
      id: "plan_1",
      name: "Executive pass",
      priceAr: 2_500_000,
    } as never);
    vi.mocked(prisma.membership.create).mockResolvedValue({ id: "membership_1" } as never);
  });

  it("creates a PENDING_PAYMENT membership with no legacy tier for a freely-named plan", async () => {
    const result = await selectIndividualPlan("plan_1");
    expect(result).toEqual({ success: true, data: { id: "membership_1" } });
    expect(prisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tier: null, status: "PENDING_PAYMENT", planId: "plan_1" }),
      })
    );
  });

  it("maps tier when the plan name matches a legacy tier", async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue({
      id: "plan_1",
      name: "EXECUTIVE",
      priceAr: 600_000,
    } as never);

    await selectIndividualPlan("plan_1");
    expect(prisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tier: "EXECUTIVE" }) })
    );
  });

  it("rejects a user who already belongs to a company", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: "company_1",
      memberships: [],
    } as never);

    const result = await selectIndividualPlan("plan_1");
    expect(result.success).toBe(false);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  it("rejects a user with an adhésion already in progress or active", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: null,
      memberships: [{ id: "membership_0" }],
    } as never);

    const result = await selectIndividualPlan("plan_1");
    expect(result.success).toBe(false);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid plan", async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue(null);
    const result = await selectIndividualPlan("plan_1");
    expect(result.success).toBe(false);
  });
});

describe("submitMembershipPaymentProof", () => {
  const VALID_INPUT = {
    method: "VIREMENT" as const,
    proofFileKey: "membership-payments/user_1/proof.pdf",
    comment: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: "membership_1",
      userId: "user_1",
      status: "PENDING_PAYMENT",
      user: { name: "Jean Rakoto", email: "jean@example.mg" },
      plan: { priceAr: 2_500_000 },
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined as never);
  });

  it("creates the payment (amount = plan price, 1 participant) and flips status to PENDING_REVIEW", async () => {
    const result = await submitMembershipPaymentProof("membership_1", VALID_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.membershipPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2_500_000 }) })
    );
  });

  it("rejects a caller who doesn't own this membership", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: "membership_1",
      userId: "someone_else",
      status: "PENDING_PAYMENT",
      user: { name: "Jean Rakoto", email: "jean@example.mg" },
      plan: { priceAr: 2_500_000 },
    } as never);

    const result = await submitMembershipPaymentProof("membership_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when the membership isn't PENDING_PAYMENT", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: "membership_1",
      userId: "user_1",
      status: "PENDING_REVIEW",
      user: { name: "Jean Rakoto", email: "jean@example.mg" },
      plan: { priceAr: 2_500_000 },
    } as never);

    const result = await submitMembershipPaymentProof("membership_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
