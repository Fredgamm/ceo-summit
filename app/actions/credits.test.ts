import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    creditPackPrice: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    creditPurchase: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    creditBalance: { upsert: vi.fn() },
    creditTransaction: { create: vi.fn() },
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
const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN" } } as never;

describe("requestCreditPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre Rakoto",
    } as never);
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
  });

  it("rejects confirming an already-processed purchase", async () => {
    vi.mocked(prisma.creditPurchase.findUnique).mockResolvedValue({
      id: "cp_1",
      status: "CONFIRMED",
    } as never);
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
    expect(prisma.creditPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) })
    );
  });
});
