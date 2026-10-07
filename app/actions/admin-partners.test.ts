import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/email-template-resolver", () => ({
  resolveEmail: vi.fn().mockResolvedValue({ subject: "s", html: "h" }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    partnerInvite: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    companySubscription: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  invitePartner,
  resendPartnerInvite,
  revokePartnerInvite,
  updatePartnerSettings,
} from "./admin-partners";

const ADMIN_SESSION = { user: { id: "admin_1", isPlatformAdmin: true } } as never;
const PARTNER_PLAN = {
  id: "plan_partner",
  name: "Partenaire Institutionnel",
  isActive: true,
  isSelfService: false,
  isUpsell: false,
  priceAr: 0,
};
const VALID_INPUT = {
  name: "Hery Rakoto",
  email: "Hery@Ministere.mg",
  planId: "plan_partner",
  memberLimit: "2",
  counterpart: "Salle de conférence",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  vi.mocked(prisma.plan.findUnique).mockResolvedValue(PARTNER_PLAN as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.partnerInvite.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.partnerInvite.create).mockResolvedValue({ id: "pi_1" } as never);
  vi.mocked(prisma.partnerInvite.findUnique).mockResolvedValue({
    id: "pi_1",
    name: "Hery Rakoto",
    email: "hery@ministere.mg",
    token: "tok",
    status: "PENDING",
    memberLimit: 2,
    plan: { name: "Partenaire Institutionnel" },
  } as never);
});

describe("invitePartner", () => {
  it("records a pending invite on a partner offer and emails the manager", async () => {
    const result = await invitePartner(VALID_INPUT);

    expect(result).toEqual({ success: true, data: { id: "pi_1" } });
    expect(prisma.partnerInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Hery Rakoto",
        email: "hery@ministere.mg",
        planId: "plan_partner",
        memberLimit: 2,
        counterpart: "Salle de conférence",
        invitedById: "admin_1",
      }),
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hery@ministere.mg" })
    );
  });

  it("requires name, email and offer", async () => {
    expect((await invitePartner({ ...VALID_INPUT, name: "" })).success).toBe(false);
    expect((await invitePartner({ ...VALID_INPUT, email: "pas-un-email" })).success).toBe(false);
    expect((await invitePartner({ ...VALID_INPUT, planId: "" })).success).toBe(false);
    expect(prisma.partnerInvite.create).not.toHaveBeenCalled();
  });

  it("refuses an offer that is not a partner offer (paid or self-service)", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      ...PARTNER_PLAN,
      priceAr: 1000,
    } as never);
    const result = await invitePartner(VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.partnerInvite.create).not.toHaveBeenCalled();
  });

  it("refuses an e-mail that already has an account or a pending invite", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: "u" } as never);
    expect((await invitePartner(VALID_INPUT)).success).toBe(false);

    vi.mocked(prisma.partnerInvite.findFirst).mockResolvedValueOnce({ id: "pi_0" } as never);
    expect((await invitePartner(VALID_INPUT)).success).toBe(false);
    expect(prisma.partnerInvite.create).not.toHaveBeenCalled();
  });

  it("keeps the invite and warns the admin when the e-mail cannot be sent", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("smtp down"));
    const result = await invitePartner(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.warning).toBeDefined();
  });

  it("is reserved to admins with the companies section", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "MODERATEUR" } as never);
    await expect(invitePartner(VALID_INPUT)).rejects.toThrow();
  });
});

describe("resendPartnerInvite / revokePartnerInvite", () => {
  it("issues a new link when resending a pending invite", async () => {
    const result = await resendPartnerInvite("pi_1");
    expect(result.success).toBe(true);
    expect(prisma.partnerInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pi_1" } })
    );
  });

  it("refuses to resend an invite that is no longer pending", async () => {
    vi.mocked(prisma.partnerInvite.findUnique).mockResolvedValueOnce({
      status: "ACCEPTED",
    } as never);
    expect((await resendPartnerInvite("pi_1")).success).toBe(false);
  });

  it("revokes only a pending invite", async () => {
    vi.mocked(prisma.partnerInvite.updateMany).mockResolvedValueOnce({ count: 1 });
    expect((await revokePartnerInvite("pi_1")).success).toBe(true);
    vi.mocked(prisma.partnerInvite.updateMany).mockResolvedValueOnce({ count: 0 });
    expect((await revokePartnerInvite("pi_1")).success).toBe(false);
  });
});

describe("updatePartnerSettings", () => {
  it("updates the member limit and counterpart of a partner company", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      plan: PARTNER_PLAN,
    } as never);
    const result = await updatePartnerSettings("company_1", { memberLimit: "3", counterpart: "" });
    expect(result.success).toBe(true);
    expect(prisma.companySubscription.update).toHaveBeenCalledWith({
      where: { companyId: "company_1" },
      data: { memberLimit: 3, counterpart: null },
    });
  });

  it("refuses a company that is not on a partner offer", async () => {
    vi.mocked(prisma.companySubscription.findUnique).mockResolvedValue({
      plan: { ...PARTNER_PLAN, isSelfService: true },
    } as never);
    expect((await updatePartnerSettings("company_1", { memberLimit: "3" })).success).toBe(false);
    expect(prisma.companySubscription.update).not.toHaveBeenCalled();
  });
});
