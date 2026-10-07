import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    companyPayment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    companySubscription: { update: vi.fn() },
    company: { update: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    eventRegistration: {
      upsert: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/event-registration-lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/event-registration-lock")>();
  return {
    ...actual,
    withEventRegistrationLock: vi.fn((_eventId: string, fn: () => Promise<unknown>) => fn()),
  };
});

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/emails/company-payment-confirmed-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/company-payment-rejected-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { sendTransactionalEmail } from "@/lib/resend";
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
      users: [
        { id: "user_1", status: "ACTIVE" },
        { id: "user_2", status: "ACTIVE" },
      ],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
    // Forme interactive (callback) : le client transactionnel est le même mock.
    if (typeof ops === "function") return ops(prisma);
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

  it("confirms the payment and activates the subscription in one transaction", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    await confirmCompanyPayment("payment_1");

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it("rejects an already-processed payment", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      status: "CONFIRMED",
    } as never);
    vi.mocked(prisma.companyPayment.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const result = await confirmCompanyPayment("payment_1");
    expect(result.success).toBe(false);
    expect(prisma.companySubscription.update).not.toHaveBeenCalled();
  });

  /**
   * Gestion corporate (7 août 2026) — notification SMS (Befiana) au payeur
   * en plus de l'email, uniquement s'il a renseigné un téléphone (champ
   * facultatif, non collecté avant ce chantier).
   */
  it("notifies the company admin by SMS when a phone number is on file", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      companySubscription: {
        ...PAYMENT_BASE.companySubscription,
        company: {
          ...PAYMENT_BASE.companySubscription.company,
          companyAdmin: { name: "Marie Dupont", email: "marie@example.mg", phone: "034 12 345 67" },
        },
      },
    } as never);

    await confirmCompanyPayment("payment_1");

    expect(sendSms).toHaveBeenCalledWith(
      "034 12 345 67",
      expect.stringContaining("Rakoto Holding")
    );
  });

  it("does not attempt an SMS when the company admin has no phone number", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(PAYMENT_BASE as never);

    await confirmCompanyPayment("payment_1");

    expect(sendSms).not.toHaveBeenCalled();
  });

  it("still confirms the payment even if the SMS send fails", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      companySubscription: {
        ...PAYMENT_BASE.companySubscription,
        company: {
          ...PAYMENT_BASE.companySubscription.company,
          companyAdmin: { name: "Marie Dupont", email: "marie@example.mg", phone: "034 12 345 67" },
        },
      },
    } as never);
    vi.mocked(sendSms).mockRejectedValueOnce(new Error("boom"));

    const result = await confirmCompanyPayment("payment_1");

    expect(result.success).toBe(true);
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

  function eventPayment(
    company: Record<string, unknown>,
    subscription: Record<string, unknown> = {}
  ) {
    return {
      ...PAYMENT_BASE,
      companySubscription: {
        ...PAYMENT_BASE.companySubscription,
        declaredParticipants: null,
        extraSeats: 0,
        plan: {
          id: "plan_1",
          eventId: "event_1",
          pricingMode: "FIXED_BUNDLE",
          maxTeamMembers: null,
        },
        ...subscription,
        company: { ...PAYMENT_BASE.companySubscription.company, ...company },
      },
    };
  }

  function registeredUserIds() {
    return vi
      .mocked(prisma.eventRegistration.upsert)
      .mock.calls.map((c) => (c[0] as { create: { userId: string } }).create.userId);
  }

  it("does not register the company admin to the event unless they ticked « Je participe »", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      eventPayment({
        companyAdminId: "admin_member",
        adminParticipates: false,
        users: [
          { id: "admin_member", status: "ACTIVE" },
          { id: "user_1", status: "ACTIVE" },
        ],
      }) as never
    );

    await confirmCompanyPayment("payment_1");
    expect(registeredUserIds()).toEqual(["user_1"]);
  });

  it("registers the company admin when they ticked « Je participe »", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      eventPayment({
        companyAdminId: "admin_member",
        adminParticipates: true,
        users: [
          { id: "admin_member", status: "ACTIVE" },
          { id: "user_1", status: "ACTIVE" },
        ],
      }) as never
    );

    await confirmCompanyPayment("payment_1");
    expect(registeredUserIds()).toEqual(["admin_member", "user_1"]);
  });

  it("skips members whose account isn't ACTIVE", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      eventPayment({
        users: [
          { id: "user_1", status: "ACTIVE" },
          { id: "user_suspended", status: "SUSPENDED" },
          { id: "user_excluded", status: "CANCELLED" },
        ],
      }) as never
    );

    await confirmCompanyPayment("payment_1");
    expect(registeredUserIds()).toEqual(["user_1"]);
  });

  it("never registers more participants than the offer's seat cap, oldest accounts first", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      eventPayment(
        {
          users: [
            { id: "user_1", status: "ACTIVE" },
            { id: "user_2", status: "ACTIVE" },
            { id: "user_3", status: "ACTIVE" },
          ],
        },
        {
          extraSeats: 0,
          plan: {
            id: "plan_1",
            eventId: "event_1",
            pricingMode: "FIXED_BUNDLE",
            maxTeamMembers: 2,
          },
        }
      ) as never
    );

    await confirmCompanyPayment("payment_1");

    expect(registeredUserIds()).toEqual(["user_1", "user_2"]);
    expect(warnSpy).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "company_payment.confirm",
        metadata: expect.objectContaining({ skippedForSeatCap: 1 }),
      }),
    });
    warnSpy.mockRestore();
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

  it("leaves the subscription alone and sends an upsell-specific email when rejecting a supplement", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({
      ...PAYMENT_BASE,
      upsellQuantity: 2,
    } as never);

    const result = await rejectCompanyPayment("payment_1", "Montant incorrect");

    expect(result.success).toBe(true);
    expect(prisma.companySubscription.update).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "marie@example.mg",
        subject: expect.stringContaining("places supplémentaires"),
      })
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
  it("reassigns when the target is a member of the company, notifying both admins", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_2",
      companyId: "company_1",
      name: "Hery Andria",
      email: "hery@example.mg",
    } as never);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      name: "Rakoto Holding",
      companyAdmin: { id: "user_1", name: "Marie Dupont", email: "marie@example.mg" },
    } as never);

    const result = await reassignCompanyAdmin("company_1", "user_2");
    expect(result.success).toBe(true);
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company_1" },
      data: { companyAdminId: "user_2" },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hery@example.mg" })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "marie@example.mg" })
    );
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
