import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/email-template-resolver", () => ({
  resolveEmail: vi.fn(async () => ({ subject: "Ouvert", react: null })),
}));
vi.mock("@/lib/preregistration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/preregistration")>()),
  getPreregistrationStatus: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    companySubscription: { findMany: vi.fn() },
    platformSetting: { upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { getPreregistrationStatus } from "@/lib/preregistration";
import { sendPaymentsOpenEmail, updatePaymentsOpenDay } from "./admin-preregistration";

const OPEN = {
  paymentsOpenOn: "2026-11-01",
  paymentsOpenAt: new Date("2026-10-31T21:00:00Z"),
  active: false,
  openEmailSentAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "admin_1", isPlatformAdmin: true } } as never);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
    role: "SUPER_ADMIN",
    active: true,
  } as never);
  vi.mocked(getPreregistrationStatus).mockResolvedValue(OPEN);
});

describe("updatePaymentsOpenDay", () => {
  it("rejects a malformed date", async () => {
    expect((await updatePaymentsOpenDay("01/11/2026")).success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("sendPaymentsOpenEmail", () => {
  it("sends nothing when no preregistration is configured", async () => {
    vi.mocked(getPreregistrationStatus).mockResolvedValue({
      ...OPEN,
      paymentsOpenOn: null,
      paymentsOpenAt: null,
    });
    expect((await sendPaymentsOpenEmail()).success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends nothing while payments are still closed", async () => {
    vi.mocked(getPreregistrationStatus).mockResolvedValue({ ...OPEN, active: true });
    expect((await sendPaymentsOpenEmail()).success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("emails the active manager of each company still awaiting payment", async () => {
    vi.mocked(prisma.companySubscription.findMany).mockResolvedValue([
      {
        plan: { name: "Gold" },
        company: { name: "A", companyAdmin: { name: "Ana", email: "ana@a.mg", status: "ACTIVE" } },
      },
      {
        plan: { name: "Gold" },
        company: {
          name: "B",
          companyAdmin: { name: "Bob", email: "bob@b.mg", status: "SUSPENDED" },
        },
      },
    ] as never);

    const result = await sendPaymentsOpenEmail();

    expect(result).toEqual({ success: true, data: { sent: 1, failed: 0 } });
    expect(prisma.companySubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PENDING_PAYMENT" } })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ana@a.mg" })
    );
  });
});
