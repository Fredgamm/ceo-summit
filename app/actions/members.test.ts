import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    user: { update: vi.fn() },
    creditBalance: { upsert: vi.fn() },
    creditTransaction: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
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
