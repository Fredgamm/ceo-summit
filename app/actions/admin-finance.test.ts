import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xxx") },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    eventRegistration: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/event-registration-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/event-payment-reminder-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { confirmEventPayment, sendEventPaymentReminder } from "./admin-finance";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

function makeRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "reg_1",
    badgeQrCode: "qr_1",
    paymentStatus: "PENDING",
    user: { name: "Fatima Said", email: "fatima@example.com" },
    event: {
      title: "CEO Summit 2026",
      date: new Date("2026-11-15"),
      isOnline: false,
      location: "La Réunion",
      price: 1_500_000,
    },
    ...overrides,
  } as never;
}

describe("confirmEventPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "FINANCIER" } as never);
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(makeRegistration());
  });

  it("confirms a pending payment and emails the member", async () => {
    const result = await confirmEventPayment("reg_1");
    expect(result.success).toBe(true);
    expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: "reg_1" },
      data: { status: "CONFIRMED", paymentStatus: "PAID" },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "fatima@example.com" })
    );
  });

  it("rejects a payment that isn't pending", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(
      makeRegistration({ paymentStatus: "PAID" })
    );
    const result = await confirmEventPayment("reg_1");
    expect(result.success).toBe(false);
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown registration", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(null);
    const result = await confirmEventPayment("reg_x");
    expect(result.success).toBe(false);
  });
});

describe("sendEventPaymentReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "FINANCIER" } as never);
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(makeRegistration());
  });

  it("emails the member a reminder", async () => {
    const result = await sendEventPaymentReminder("reg_1");
    expect(result.success).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "fatima@example.com" })
    );
  });
});
