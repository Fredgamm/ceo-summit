import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    creditPackPrice: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    creditPurchase: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditBalance: { upsert: vi.fn() },
    creditTransaction: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/credit-purchase-confirmed-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/admin-credit-purchase-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { requestCreditPurchase, confirmCreditPurchase, rejectCreditPurchase } from "./credits";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;
const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

describe("requestCreditPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre Rakoto",
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 2 } } },
    } as never);
  });

  it("rejects a member below Executive rank", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre Rakoto",
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);

    const result = await requestCreditPurchase(5, "VIREMENT");

    expect(result.success).toBe(false);
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  it("creates a pending purchase and alerts the admin", async () => {
    process.env.ADMIN_ALERT_EMAIL = "admin@ceosummit.mg";
    vi.mocked(prisma.creditPackPrice.findUnique).mockResolvedValue({
      credits: 5,
      priceAr: 100000,
    } as never);

    const result = await requestCreditPurchase(5, "VIREMENT");

    expect(result.success).toBe(true);
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ credits: 5, priceAr: 100000, status: "PENDING" }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid pack", async () => {
    vi.mocked(prisma.creditPackPrice.findUnique).mockResolvedValue(null);
    const result = await requestCreditPurchase(7, "VIREMENT");
    expect(result.success).toBe(false);
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });
});

describe("confirmCreditPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("confirms the purchase, credits the balance, and emails the buyer", async () => {
    vi.mocked(prisma.creditPurchase.findUnique).mockResolvedValue({
      id: "cp_1",
      userId: "user_1",
      credits: 5,
      status: "PENDING",
      user: { name: "Jean-Pierre Rakoto", email: "jp@example.com" },
    } as never);

    const result = await confirmCreditPurchase("cp_1");

    expect(result.success).toBe(true);
    expect(prisma.creditBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { purchased: { increment: 5 } } })
    );
    expect(prisma.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 5, type: "PURCHASE" }) })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "credit_purchase.confirm", targetId: "cp_1" }),
      })
    );
  });

  /**
   * Correctif (7 août 2026, audit) — la vérification `status !== "PENDING"`
   * se faisait sur une lecture antérieure à l'écriture, sans verrou ni
   * condition sur l'update lui-même : deux confirmations concurrentes
   * (double-clic, deux admins) pouvaient toutes deux créditer le même achat.
   */
  it("does not double-credit when the status flip races (updateMany affects 0 rows)", async () => {
    vi.mocked(prisma.creditPurchase.findUnique).mockResolvedValue({
      id: "cp_1",
      userId: "user_1",
      credits: 5,
      status: "PENDING",
      user: { name: "Jean-Pierre Rakoto", email: "jp@example.com" },
    } as never);
    vi.mocked(prisma.creditPurchase.updateMany).mockResolvedValueOnce({ count: 0 });

    const result = await confirmCreditPurchase("cp_1");

    expect(result.success).toBe(false);
    expect(prisma.creditBalance.upsert).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects confirming an already-processed purchase", async () => {
    vi.mocked(prisma.creditPurchase.findUnique).mockResolvedValue({
      id: "cp_1",
      status: "CONFIRMED",
    } as never);
    vi.mocked(prisma.creditPurchase.updateMany).mockResolvedValueOnce({ count: 0 });
    const result = await confirmCreditPurchase("cp_1");
    expect(result.success).toBe(false);
    expect(prisma.creditBalance.upsert).not.toHaveBeenCalled();
  });
});

describe("rejectCreditPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("marks a pending purchase as rejected", async () => {
    vi.mocked(prisma.creditPurchase.findUnique).mockResolvedValue({
      id: "cp_1",
      status: "PENDING",
    } as never);

    const result = await rejectCreditPurchase("cp_1");

    expect(result.success).toBe(true);
    expect(prisma.creditPurchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cp_1", status: "PENDING" },
        data: expect.objectContaining({ status: "REJECTED" }),
      })
    );
  });

  /** Correctif (7 août 2026, audit) — même race que confirmCreditPurchase. */
  it("does not double-process when the status flip races (updateMany affects 0 rows)", async () => {
    vi.mocked(prisma.creditPurchase.findUnique).mockResolvedValue({
      id: "cp_1",
      status: "PENDING",
    } as never);
    vi.mocked(prisma.creditPurchase.updateMany).mockResolvedValueOnce({ count: 0 });

    const result = await rejectCreditPurchase("cp_1");

    expect(result.success).toBe(false);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
