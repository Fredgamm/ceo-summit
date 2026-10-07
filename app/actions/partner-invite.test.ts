import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: () => new Headers() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0 }),
}));
vi.mock("@/app/actions/company", () => ({
  validateSectorAndCountry: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    partnerInvite: { updateMany: vi.fn(), update: vi.fn() },
    user: { create: vi.fn(), update: vi.fn() },
    company: { create: vi.fn() },
    companySubscription: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      partnerInvite: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { acceptPartnerInvite } from "./partner-invite";

const tx = (prisma as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> })
  .__tx;

const INVITE = {
  id: "pi_1",
  name: "Hery Rakoto",
  email: "hery@ministere.mg",
  planId: "plan_partner",
  memberLimit: 3,
  counterpart: "Salle de conférence",
  status: "PENDING",
  expiresAt: new Date(Date.now() + 86_400_000),
  plan: { isActive: true, isSelfService: false, isUpsell: false, priceAr: 0 },
};
const INPUT = {
  companyName: "Ministère du Commerce",
  sector: "Administration publique & Secteur public",
  country: "Madagascar",
  password: "Motdepasse1",
  confirmPassword: "Motdepasse1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.partnerInvite.findUnique).mockResolvedValue(INVITE as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  tx.partnerInvite.updateMany.mockResolvedValue({ count: 1 });
  tx.user.create.mockResolvedValue({ id: "user_1" });
  tx.company.create.mockResolvedValue({ id: "company_1" });
});

describe("acceptPartnerInvite", () => {
  it("creates the manager, the company he manages and an active subscription without payment", async () => {
    const result = await acceptPartnerInvite("tok", INPUT);

    expect(result).toEqual({ success: true, data: { email: "hery@ministere.mg" } });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "hery@ministere.mg", status: "ACTIVE" }),
    });
    expect(tx.company.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Ministère du Commerce", companyAdminId: "user_1" }),
    });
    const sub = tx.companySubscription.create.mock.calls[0][0].data;
    expect(sub).toMatchObject({
      companyId: "company_1",
      planId: "plan_partner",
      status: "ACTIVE",
      memberLimit: 3,
      counterpart: "Salle de conférence",
    });
    // Un an, comme les autres offres.
    expect(sub.endDate.getFullYear() - sub.startDate.getFullYear()).toBe(1);
  });

  it("refuses an expired, revoked or already used invite", async () => {
    for (const patch of [
      { expiresAt: new Date(Date.now() - 1000) },
      { status: "REVOKED" },
      { status: "ACCEPTED" },
    ]) {
      vi.mocked(prisma.partnerInvite.findUnique).mockResolvedValueOnce({
        ...INVITE,
        ...patch,
      } as never);
      expect((await acceptPartnerInvite("tok", INPUT)).success).toBe(false);
    }
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("refuses when the offer is no longer a partner offer", async () => {
    vi.mocked(prisma.partnerInvite.findUnique).mockResolvedValueOnce({
      ...INVITE,
      plan: { ...INVITE.plan, isActive: false },
    } as never);
    expect((await acceptPartnerInvite("tok", INPUT)).success).toBe(false);
  });

  it("consumes the invite only once (double click)", async () => {
    tx.partnerInvite.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await acceptPartnerInvite("tok", INPUT);
    expect(result.success).toBe(false);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("requires a company name and matching passwords", async () => {
    expect((await acceptPartnerInvite("tok", { ...INPUT, companyName: "" })).success).toBe(false);
    expect(
      (await acceptPartnerInvite("tok", { ...INPUT, confirmPassword: "Autre1234" })).success
    ).toBe(false);
  });
});
