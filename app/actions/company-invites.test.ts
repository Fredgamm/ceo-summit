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
    eventRegistration: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/company-invite-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inviteTeammate, revokeInvite, acceptCompanyInvite } from "./company-invites";

const SESSION = { user: { id: "admin_user_1" } } as never;

describe("inviteTeammate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://app.ceosummit.mg";
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
      subscription: { plan: { maxTeamMembers: 2 } },
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
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: "user_new" }, {}] as never);
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue(null);
  });

  it("creates the account (ACTIVE, password set immediately) with companyId pre-filled", async () => {
    const result = await acceptCompanyInvite("token_1", PASSWORD, PASSWORD);
    expect(result).toEqual({ success: true, data: { email: "marie@example.mg" } });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("registers the new collaborator to the linked event when the subscription is ACTIVE (RG-14)", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      status: "ACTIVE",
      plan: { id: "plan_1", eventId: "event_1" },
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
