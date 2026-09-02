import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
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
  eraseUserData,
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

  /**
   * RGPD — droit à l'effacement (audit du 7 août : "impossible, relations
   * Prisma en Restrict"). Anonymisation en place plutôt qu'une vraie
   * suppression de ligne, pour ne pas casser les FK Restrict de tout ce que
   * ce membre a produit ni invalider les échanges des autres membres avec
   * lui.
   */
  describe("eraseUserData", () => {
    beforeEach(() => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user_1",
        erasedAt: null,
      } as never);
    });

    it("anonymizes the member's personal data, excludes the account, and logs it", async () => {
      const result = await eraseUserData("user_1");

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: expect.objectContaining({
          name: "Membre supprimé",
          email: "erased-user_1@erased.ceosummit.invalid",
          passwordHash: null,
          status: "CANCELLED",
          erasedAt: expect.any(Date),
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "member.erase_data", targetId: "user_1" }),
        })
      );
    });

    it("rejects an unknown member", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const result = await eraseUserData("user_x");
      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a member whose data was already erased", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user_1",
        erasedAt: new Date("2026-08-01"),
      } as never);
      const result = await eraseUserData("user_1");
      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
