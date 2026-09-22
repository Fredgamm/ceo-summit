import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    companyInvite: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    companySubscription: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    eventRegistration: {
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
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

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/company-invite-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/company-collaborator-welcome-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/event-registration-email", () => ({ default: vi.fn(() => null) }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xxx") },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { inviteTeammate, resendInvite, revokeInvite, acceptCompanyInvite } from "./company-invites";

const SESSION = { user: { id: "admin_user_1" } } as never;

describe("inviteTeammate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://app.ceo-summit.mg";
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      name: "Rakoto Holding",
      companyAdminId: "admin_user_1",
      subscription: null,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.companyInvite.findFirst).mockResolvedValue(null);
  });

  it("invites a teammate when there is no plan cap yet", async () => {
    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result.success).toBe(true);
    expect(prisma.companyInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: "company_1", email: "marie@example.mg" }),
      })
    );
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "someone_else",
      subscription: null,
    } as never);

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.create).not.toHaveBeenCalled();
  });

  it("enforces the plan's maxTeamMembers once a plan is chosen", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      name: "Rakoto Holding",
      companyAdminId: "admin_user_1",
      adminParticipates: false,
      subscription: {
        plan: { pricingMode: "FIXED_BUNDLE", maxTeamMembers: 2 },
        declaredParticipants: null,
        extraSeats: 0,
      },
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    vi.mocked(prisma.companyInvite.count).mockResolvedValue(1);

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.create).not.toHaveBeenCalled();
  });

  it("rejects an email already tied to an account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await inviteTeammate("company_1", {
      name: "Marie Dupont",
      email: "marie@example.mg",
    });
    expect(result.success).toBe(false);
  });
});

describe("revokeInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    process.env.NEXTAUTH_URL = "https://app.ceo-summit.mg";
  });

  it("regenerates the token and re-sends the invite email as the company admin", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      companyId: "company_1",
      email: "marie@example.mg",
      name: "Marie Dupont",
      status: "PENDING",
      company: { companyAdminId: "admin_user_1", name: "Rakoto Holding" },
    } as never);

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
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      status: "PENDING",
      company: { companyAdminId: "someone_else" },
    } as never);

    const result = await resendInvite("invite_1");
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.update).not.toHaveBeenCalled();
  });

  it("rejects an invite that isn't pending anymore", async () => {
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      status: "ACCEPTED",
      company: { companyAdminId: "admin_user_1" },
    } as never);

    const result = await resendInvite("invite_1");
    expect(result.success).toBe(false);
    expect(prisma.companyInvite.update).not.toHaveBeenCalled();
  });
});

describe("acceptCompanyInvite", () => {
  const PASSWORD = "Password1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.companyInvite.findUnique).mockResolvedValue({
      id: "invite_1",
      companyId: "company_1",
      email: "marie@example.mg",
      name: "Marie Dupont",
      status: "PENDING",
      company: { name: "Rakoto Holding" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockResolvedValue([
      { id: "user_new", email: "marie@example.mg", name: "Marie Dupont" },
      {},
    ] as never);
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue(null);
  });

  it("creates the account (ACTIVE, password set immediately) with companyId pre-filled", async () => {
    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result).toEqual({ success: true, data: { email: "marie@example.mg" } });
    expect(prisma.$transaction).toHaveBeenCalled();
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
      plan: { id: "plan_1", eventId: "event_1" },
    } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: "event_1",
      title: "CEO Summit 2026",
      date: new Date("2026-11-15T09:00:00Z"),
      isOnline: false,
      location: "Saint-Denis",
      capacity: 300,
    } as never);
    vi.mocked(prisma.eventRegistration.upsert).mockResolvedValue({
      badgeQrCode: "qr_token_1",
    } as never);

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
  });

  /**
   * Correctif (7 août 2026) — jusqu'ici aucun email n'informait le
   * collaborateur de son inscription automatique (RG-14), contrairement au
   * parcours d'inscription individuelle (registerForEvent).
   *
   * Décision d'architecture (sept. 2026, conception/09) — cet email ne
   * transmet plus de QR de check-in (retiré du chemin actif).
   */
  it("emails the collaborator their registration confirmation when auto-registered to the event (RG-14)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "ACTIVE",
      plan: { id: "plan_1", eventId: "event_1" },
    } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: "event_1",
      title: "CEO Summit 2026",
      date: new Date("2026-11-15T09:00:00Z"),
      isOnline: false,
      location: "Saint-Denis",
      capacity: 300,
    } as never);
    vi.mocked(prisma.eventRegistration.upsert).mockResolvedValue({} as never);

    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("CEO Summit 2026"),
      })
    );
  });

  it("does not attempt to email a badge when the event is full (no registration created)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "ACTIVE",
      plan: { id: "plan_1", eventId: "event_1" },
    } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: "event_1",
      title: "CEO Summit 2026",
      date: new Date("2026-11-15T09:00:00Z"),
      isOnline: false,
      location: "Saint-Denis",
      capacity: 10,
    } as never);
    vi.mocked(prisma.eventRegistration.count).mockResolvedValue(10);

    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
    // Toujours l'email de bienvenue (indépendant de l'évènement), jamais la
    // confirmation d'inscription évènement puisqu'aucune place n'était
    // disponible.
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Bienvenue") })
    );
  });

  it("does not register to the event when the subscription has EXPIRED (past edition)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "EXPIRED",
      plan: { id: "plan_1", eventId: "event_1" },
    } as never);

    await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);

    expect(prisma.eventRegistration.upsert).not.toHaveBeenCalled();
  });

  it("does not register to any event for a platform-only plan (no eventId)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "ACTIVE",
      plan: { id: "plan_1", eventId: null },
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
