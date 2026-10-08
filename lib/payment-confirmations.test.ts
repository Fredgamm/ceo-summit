import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/event-auto-registration", () => ({
  autoRegisterCompanyMembers: vi.fn().mockResolvedValue({ registered: 0, full: 0 }),
  syncPlanEventRegistrations: vi.fn().mockResolvedValue({ registered: 0 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyPayment: { findUnique: vi.fn(), updateMany: vi.fn() },
    companySubscription: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    emailTemplateOverride: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/event-registration-lock", () => ({
  withEventRegistrationLock: vi.fn((_eventId: string, fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn().mockResolvedValue({}) }));

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { confirmCompanyPaymentCore } from "./payment-confirmations";
import { autoRegisterCompanyMembers } from "@/lib/event-auto-registration";

const UPSELL_PAYMENT = {
  id: "payment_1",
  status: "PENDING",
  companySubscriptionId: "sub_1",
  upsellQuantity: 3,
  upsellPlan: { id: "plan_upsell", name: "Executive Pass", priceAr: 4_715_800 },
  companySubscription: {
    companyId: "company_1",
    plan: { id: "plan_1", eventId: null },
    company: {
      name: "Rakoto Holding",
      companyAdmin: { name: "Marie Dupont", email: "marie@example.mg" },
      users: [{ id: "user_1" }],
    },
  },
};

/**
 * 22 septembre 2026 (audit des emails transactionnels) — trou confirmé : la
 * branche upsell de confirmCompanyPaymentCore incrémentait extraSeats sans
 * jamais notifier le gestionnaire, contrairement à la branche paiement
 * initial (voir CompanyUpsellConfirmedEmail).
 */
describe("confirmCompanyPaymentCore — upsell branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(UPSELL_PAYMENT as never);
    vi.mocked(prisma.companyPayment.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.$transaction).mockImplementation((async (cb: (tx: unknown) => unknown) =>
      cb(prisma)) as never);
  });

  it("confirms the payment and increments extraSeats inside one transaction", async () => {
    await confirmCompanyPaymentCore("payment_1", "admin_1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.companyPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "payment_1", status: "PENDING" } })
    );
  });

  it("does not leave a CONFIRMED payment without its seats when the increment fails", async () => {
    // La transaction réelle annule tout : on vérifie ici que l'échec remonte
    // (pas d'email « supplément confirmé » envoyé pour des places absentes).
    vi.mocked(prisma.companySubscription.update).mockRejectedValueOnce(new Error("db down"));

    await expect(confirmCompanyPaymentCore("payment_1", "admin_1")).rejects.toThrow("db down");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("increments extraSeats and emails the company admin", async () => {
    const result = await confirmCompanyPaymentCore("payment_1", "admin_1");

    expect(result).toEqual({ success: true, data: { companyId: "company_1" } });
    // Module 21 — les nouvelles places sont remplies par les membres pas encore inscrits.
    expect(autoRegisterCompanyMembers).toHaveBeenCalledWith(
      "company_1",
      "confirmCompanyPaymentCore"
    );
    expect(prisma.companySubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { extraSeats: { increment: 3 } },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "marie@example.mg" })
    );
  });

  it("reports already-processed without touching extraSeats or sending anything", async () => {
    vi.mocked(prisma.companyPayment.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await confirmCompanyPaymentCore("payment_1", "admin_1");

    expect(result.success).toBe(false);
    expect(prisma.companySubscription.update).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not fail the confirmation when the notification email throws", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("smtp down"));

    const result = await confirmCompanyPaymentCore("payment_1", "admin_1");

    expect(result.success).toBe(true);
  });
});
