import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    membership: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    user: { update: vi.fn() },
    creditBalance: { upsert: vi.fn() },
    creditTransaction: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    plan: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/membership-sync", () => ({
  syncUserPlanCache: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminAccessError } from "@/lib/admin-auth";
import { syncUserPlanCache } from "@/lib/membership-sync";
import {
  changeMemberTier,
  suspendMember,
  excludeMember,
  reactivateMember,
  grantCredits,
  saveMemberNote,
} from "./members";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

describe("member admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.plan.findFirst).mockResolvedValue({ id: "plan_chairman" } as never);
  });

  describe("changeMemberTier", () => {
    it("updates the existing active membership and syncs User.role + Plan cache", async () => {
      vi.mocked(prisma.membership.findFirst).mockResolvedValue({ id: "mem_1" } as never);

      const result = await changeMemberTier("user_1", "CHAIRMAN");

      expect(result.success).toBe(true);
      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: { id: "mem_1" },
        data: { tier: "CHAIRMAN", planId: "plan_chairman" },
      });
      expect(prisma.membership.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "CHAIRMAN" },
      });
      expect(syncUserPlanCache).toHaveBeenCalledWith("user_1", "plan_chairman");
    });

    it("creates a zero-price admin-granted membership when none is active", async () => {
      vi.mocked(prisma.membership.findFirst).mockResolvedValue(null);

      const result = await changeMemberTier("user_1", "EXECUTIVE");

      expect(result.success).toBe(true);
      expect(prisma.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: "EXECUTIVE", price: 0, status: "ACTIVE" }),
        })
      );
    });

    it("throws when the caller isn't an admin", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: "user_1", role: "MEMBER" } } as never);
      await expect(changeMemberTier("user_1", "CHAIRMAN")).rejects.toBeInstanceOf(AdminAccessError);
    });
  });

  describe("status transitions", () => {
    it("suspends a member", async () => {
      const result = await suspendMember("user_1");
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { status: "SUSPENDED" },
      });
    });

    it("excludes a member", async () => {
      const result = await excludeMember("user_1");
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { status: "CANCELLED" },
      });
    });

    it("reactivates a member", async () => {
      const result = await reactivateMember("user_1");
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { status: "ACTIVE" },
      });
    });
  });

  describe("grantCredits", () => {
    it("adds to the purchased bucket and logs an ADMIN_GRANT transaction", async () => {
      const result = await grantCredits("user_1", 5, "Geste commercial");

      expect(result.success).toBe(true);
      expect(prisma.creditBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { purchased: { increment: 5 } } })
      );
      expect(prisma.creditTransaction.create).toHaveBeenCalledWith({
        data: { userId: "user_1", amount: 5, type: "ADMIN_GRANT", reason: "Geste commercial" },
      });
    });

    it("rejects a non-positive amount", async () => {
      const result = await grantCredits("user_1", 0, "x");
      expect(result.success).toBe(false);
      expect(prisma.creditBalance.upsert).not.toHaveBeenCalled();
    });
  });

  describe("saveMemberNote", () => {
    it("updates the member's admin note", async () => {
      const result = await saveMemberNote("user_1", "À surveiller.");
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { adminNote: "À surveiller." },
      });
    });
  });
});
