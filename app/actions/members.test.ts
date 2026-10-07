import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { suspendMember, excludeMember, reactivateMember, saveMemberNote } from "./members";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;
const MEMBER = { id: "user_1", name: "Hery Andria", email: "hery@example.mg" };

describe("member admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.user.update).mockResolvedValue(MEMBER as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isPlatformAdmin: false } as never);
  });

  describe("status transitions", () => {
    it("suspends a member and notifies them by email", async () => {
      const result = await suspendMember("user_1");
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { status: "SUSPENDED" },
      });
      expect(sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "hery@example.mg" })
      );
    });

    it("excludes a member and notifies them by email", async () => {
      const result = await excludeMember("user_1");
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { status: "CANCELLED" },
      });
      expect(sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "hery@example.mg" })
      );
    });

    it("refuses to suspend a platform admin from the member page", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ isPlatformAdmin: true } as never);
      const result = await suspendMember("user_1");
      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses to change the acting admin's own status", async () => {
      const result = await excludeMember("admin_1");
      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("returns an error for an unknown member instead of throwing", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const result = await suspendMember("ghost");
      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("reactivates a member and notifies them by email", async () => {
      const result = await reactivateMember("user_1");
      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { status: "ACTIVE" },
      });
      expect(sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "hery@example.mg" })
      );
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
