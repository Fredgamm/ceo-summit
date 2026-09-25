import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-viewer", () => ({ requireViewer: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    companyInvite: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    companySubscription: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    eventRegistration: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
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

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/emails/company-invite-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/company-collaborator-welcome-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/event-registration-email", () => ({ default: vi.fn(() => null) }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xxx") },
}));

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  inviteTeammate,
  resendInvite,
  revokeInvite,
  acceptCompanyInvite,
  setAdminParticipates,
} from "./company-invites";

const VIEWER = { id: "admin_user_1", name: "Jean Rakoto", email: "jean@example.mg" };
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const EVENT = {
  id: "event_1",
  title: "CEO Summit 2026",
  date: new Date("2099-11-15T09:00:00Z"),
  isOnline: false,
  location: "Saint-Denis",
  capacity: 300,
};

function activeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "ACTIVE",
    declaredParticipants: null,
    extraSeats: 0,
    plan: {
      id: "plan_1",
      eventId: null,
      event: null,
      pricingMode: "FIXED_BUNDLE",
      maxTeamMembers: 3,
    },
    ...overrides,
  };
}

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: "company_1",
    name: "Rakoto Holding",
    companyAdminId: "admin_user_1",
    adminParticipates: false,
    subscription: activeSubscription(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://app.ceo-summit.mg";
  vi.mocked(requireViewer).mockResolvedValue({ success: true, viewer: VIEWER } as never);
  vi.mocked(sendTransactionalEmail).mockResolvedValue({} as never);
  vi.mocked(prisma.user.count).mockResolvedValue(0);
  vi.mocked(prisma.companyInvite.count).mockResolvedValue(0);
  vi.mocked(prisma.companyInvite.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.eventRegistration.count).mockResolvedValue(0);
  vi.mocked(prisma.$transaction).mockImplementation((async (cb: (tx: unknown) => unknown) =>
    cb(prisma)) as never);
});

describe("inviteTeammate", () => {
  beforeEach(() => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(company() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.companyInvite.findFirst).mockResolvedValue(null);
  });

  it("invites a teammate once the subscription is ACTIVE and seats remain", async () => {
    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result).toEqual({ success: true, data: undefined });
    expect(prisma.companyInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: "company_1", email: "marie@example.mg" }),
      })
    );
  });

  it("rejects a caller whose account is no longer active (requireViewer)", async () => {
    vi.mocked(requireViewer).mockResolvedValue({ success: false, error: "Non authentifié." });

    const result = await inviteTeammate("company_1", { name: "Marie", email: "m@example.mg" });
    expect(result).toEqual({ success: false, error: "Non authentifié." });
    expect(prisma.companyInvite.create).not.toHaveBeenCalled();
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({ companyAdminId: "someone_else" }) as never
    );

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.create).not.toHaveBeenCalled();
  });

  it.each([
    ["no subscription", null],
    ["PENDING_PAYMENT", activeSubscription({ status: "PENDING_PAYMENT" })],
    ["PENDING_REVIEW", activeSubscription({ status: "PENDING_REVIEW" })],
  ])("refuses invitations before payment is validated (%s)", async (_label, subscription) => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(company({ subscription }) as never);

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result).toEqual({
      success: false,
      error: "Les invitations s'ouvrent une fois votre paiement validé.",
    });
    expect(prisma.companyInvite.create).not.toHaveBeenCalled();
  });

  it("enforces the seat cap using the shared seat count", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    vi.mocked(prisma.companyInvite.count).mockResolvedValue(1);

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Plafond de 3");
      expect(result.error).not.toContain("offre ci-dessous");
    }
    expect(prisma.companyInvite.create).not.toHaveBeenCalled();
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: "company_1",
        status: { in: ["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"] },
        id: { not: "admin_user_1" },
      }),
    });
  });

  it("rejects an email already tied to an account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result.success).toBe(false);
  });

  it("returns success with a warning when the invite email fails to send", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("smtp down"));

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result).toEqual({
      success: true,
      data: undefined,
      warning: expect.stringContaining("l'email n'a pas pu être envoyé"),
    });
    expect(prisma.companyInvite.create).toHaveBeenCalled();
  });
});

describe("revokeInvite", () => {
  it("revokes a pending invite as the company admin", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      companyId: "company_1",
      status: "PENDING",
      company: { companyAdminId: "admin_user_1" },
    } as never);

    const result = await revokeInvite("invite_1");
    expect(result.success).toBe(true);
    expect(prisma.companyInvite.update).toHaveBeenCalledWith({
      where: { id: "invite_1" },
      data: { status: "REVOKED" },
    });
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      companyId: "company_1",
      status: "PENDING",
      company: { companyAdminId: "someone_else" },
    } as never);

    const result = await revokeInvite("invite_1");
    expect(result.success).toBe(false);
  });
});

describe("resendInvite", () => {
  function pendingInvite(overrides: Record<string, unknown> = {}) {
    return {
      id: "invite_1",
      companyId: "company_1",
      email: "marie@example.mg",
      name: "Marie Dupont",
      status: "PENDING",
      expiresAt: FUTURE,
      company: company(),
      ...overrides,
    };
  }

  it("regenerates the token and re-sends the invite email as the company admin", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue(pendingInvite() as never);

    const result = await resendInvite("invite_1");
    expect(result.success).toBe(true);
    expect(prisma.companyInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invite_1" },
        data: expect.objectContaining({ token: expect.any(String) }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "marie@example.mg" })
    );
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue(
      pendingInvite({ company: company({ companyAdminId: "someone_else" }) }) as never
    );

    const result = await resendInvite("invite_1");
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.update).not.toHaveBeenCalled();
  });

  it("rejects an invite that isn't pending anymore", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue(
      pendingInvite({ status: "ACCEPTED" }) as never
    );

    const result = await resendInvite("invite_1");
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.update).not.toHaveBeenCalled();
  });

  it("refuses to resend before the payment is validated", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue(
      pendingInvite({
        company: company({ subscription: activeSubscription({ status: "PENDING_REVIEW" }) }),
      }) as never
    );

    const result = await resendInvite("invite_1");
    expect(result).toEqual({
      success: false,
      error: "Les invitations s'ouvrent une fois votre paiement validé.",
    });
    expect(prisma.companyInvite.update).not.toHaveBeenCalled();
  });

  it("refuses to revive an expired invite when every seat is already taken", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue(
      pendingInvite({ expiresAt: PAST }) as never
    );
    // 3 places sur 3 déjà prises par d'autres (l'invitation expirée ne compte plus).
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    vi.mocked(prisma.companyInvite.count).mockResolvedValue(1);

    const result = await resendInvite("invite_1");
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.update).not.toHaveBeenCalled();
    expect(prisma.companyInvite.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { not: "invite_1" } }),
    });
  });

  it("resends a still-valid invite that already holds its seat at the cap", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue(pendingInvite() as never);
    // Hors de cette invitation : 2 places prises sur 3 → elle tient.
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    vi.mocked(prisma.companyInvite.count).mockResolvedValue(0);

    const result = await resendInvite("invite_1");
    expect(result.success).toBe(true);
  });
});

describe("acceptCompanyInvite", () => {
  const PASSWORD = "Password1";

  beforeEach(() => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      companyId: "company_1",
      email: "marie@example.mg",
      name: "Marie Dupont",
      status: "PENDING",
      expiresAt: FUTURE,
      company: {
        id: "company_1",
        name: "Rakoto Holding",
        companyAdminId: "admin_user_1",
        adminParticipates: false,
      },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user_new",
      email: "marie@example.mg",
      name: "Marie Dupont",
    } as never);
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue(null);
  });

  it("creates the account (ACTIVE, password set immediately) with companyId pre-filled", async () => {
    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result).toEqual({ success: true, data: { email: "marie@example.mg" } });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: "company_1", status: "ACTIVE" }),
    });
  });

  it("consumes the invite only while it is still PENDING, inside the transaction", async () => {
    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(prisma.companyInvite.updateMany).toHaveBeenCalledWith({
      where: { id: "invite_1", status: "PENDING" },
      data: expect.objectContaining({ status: "ACCEPTED" }),
    });
  });

  it("does not create a second account when a concurrent acceptance already consumed the invite", async () => {
    vi.mocked(prisma.companyInvite.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("returns a message instead of throwing on the email unique constraint", async () => {
    vi.mocked(prisma.user.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("Un compte existe déjà"),
    });
  });

  it("refuses when the offer's seats are all taken by others", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue(
      activeSubscription() as never
    );
    vi.mocked(prisma.user.count).mockResolvedValue(3);

    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  /**
   * 22 septembre 2026 (audit des emails transactionnels) — jusqu'ici, le
   * seul cas notifié était l'inscription évènement (RG-14, ci-dessous) ;
   * sans abonnement ACTIVE lié à un évènement (comme ici), le collaborateur
   * n'avait aucune confirmation que son compte était créé et actif.
   */
  it("emails the new collaborator a welcome confirmation, regardless of subscription status", async () => {
    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "marie@example.mg" })
    );
  });

  it("registers the new collaborator to the linked event when the subscription is ACTIVE (RG-14)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "ACTIVE",
      declaredParticipants: null,
      extraSeats: 0,
      plan: { id: "plan_1", eventId: "event_1", maxTeamMembers: null },
    } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);
    vi.mocked(prisma.eventRegistration.upsert).mockResolvedValue({} as never);

    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(prisma.eventRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: "event_1", userId: "user_new" } },
        create: expect.objectContaining({
          eventId: "event_1",
          userId: "user_new",
          planId: "plan_1",
        }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("CEO Summit 2026") })
    );
  });

  it("does not attempt to email a badge when the event is full (no registration created)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "ACTIVE",
      declaredParticipants: null,
      extraSeats: 0,
      plan: { id: "plan_1", eventId: "event_1", maxTeamMembers: null },
    } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({ ...EVENT, capacity: 10 } as never);
    vi.mocked(prisma.eventRegistration.count).mockResolvedValue(10);

    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Bienvenue") })
    );
  });

  it("does not register to the event when the subscription has EXPIRED (past edition)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "EXPIRED",
      declaredParticipants: null,
      extraSeats: 0,
      plan: { id: "plan_1", eventId: "event_1", maxTeamMembers: null },
    } as never);

    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
  });

  it("does not register to any event for a platform-only plan (no eventId)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "ACTIVE",
      declaredParticipants: null,
      extraSeats: 0,
      plan: { id: "plan_1", eventId: null, maxTeamMembers: null },
    } as never);

    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
  });

  it("rejects an already-accepted invite", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      status: "ACCEPTED",
    } as never);

    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result.success).toBe(false);
  });

  it("rejects when an account already exists for that email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", async () => {
    const result = await acceptCompanyInvite("token_1", PASSWORD, "Different1");
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("setAdminParticipates", () => {
  const EVENT_SUBSCRIPTION = activeSubscription({
    plan: {
      id: "plan_1",
      eventId: "event_1",
      event: EVENT,
      pricingMode: "FIXED_BUNDLE",
      maxTeamMembers: 3,
    },
  });

  it("only flips the flag while the subscription isn't ACTIVE", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({ subscription: { ...EVENT_SUBSCRIPTION, status: "PENDING_REVIEW" } }) as never
    );

    const result = await setAdminParticipates("company_1", true);
    expect(result.success).toBe(true);
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company_1" },
      data: { adminParticipates: true },
    });
    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
    expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  it("registers the admin to the event when checking the box on an ACTIVE subscription", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({ subscription: EVENT_SUBSCRIPTION }) as never
    );
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);
    vi.mocked(prisma.eventRegistration.upsert).mockResolvedValue({} as never);

    const result = await setAdminParticipates("company_1", true);
    expect(result).toEqual({ success: true, data: undefined });
    expect(prisma.eventRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: "event_1", userId: "admin_user_1" } },
        create: expect.objectContaining({ status: "CONFIRMED", planId: "plan_1" }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jean@example.mg" })
    );
  });

  it("is never blocked by the offer's seat cap (product choice), only by event capacity", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({ subscription: EVENT_SUBSCRIPTION }) as never
    );
    vi.mocked(prisma.user.count).mockResolvedValue(3);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);

    const result = await setAdminParticipates("company_1", true);
    expect(result.success).toBe(true);
    expect(prisma.eventRegistration.upsert).toHaveBeenCalled();
  });

  it("keeps the choice but warns when the event is full", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({ subscription: EVENT_SUBSCRIPTION }) as never
    );
    vi.mocked(prisma.event.findUnique).mockResolvedValue({ ...EVENT, capacity: 5 } as never);
    vi.mocked(prisma.eventRegistration.count).mockResolvedValue(5);

    const result = await setAdminParticipates("company_1", true);
    expect(result).toEqual({
      success: true,
      data: undefined,
      warning: expect.stringContaining("complet"),
    });
    expect(prisma.company.update).toHaveBeenCalled();
    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
  });

  it("cancels the admin's registration when unchecking the box", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({ adminParticipates: true, subscription: EVENT_SUBSCRIPTION }) as never
    );

    const result = await setAdminParticipates("company_1", false);
    expect(result.success).toBe(true);
    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: "event_1",
        userId: "admin_user_1",
        status: { not: "CANCELLED" },
        checkedIn: false,
      },
      data: { status: "CANCELLED" },
    });
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(
      company({ companyAdminId: "someone_else" }) as never
    );

    const result = await setAdminParticipates("company_1", true);
    expect(result.success).toBe(false);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});
