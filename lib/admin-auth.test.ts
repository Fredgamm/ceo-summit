import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: vi.fn() } },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "./admin-auth";

const ADMIN_SESSION = { user: { id: "user_1", isPlatformAdmin: true } } as never;

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(requireAdmin("membres")).rejects.toThrow(AdminAccessError);
  });

  it("rejects a session without isPlatformAdmin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1", isPlatformAdmin: false } } as never);
    await expect(requireAdmin("membres")).rejects.toThrow(AdminAccessError);
  });

  /**
   * Correctif (7 août 2026, audit) — `toggleAdminActive` ne faisait rien
   * respecter : aucun test n'existait pour cette fonction ni pour le
   * chemin de refus RBAC en général avant ce fichier.
   */
  it("rejects a deactivated admin (AdminUser.active === false), even with a valid isPlatformAdmin session", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      role: "SUPER_ADMIN",
      active: false,
    } as never);

    await expect(requireAdmin("membres")).rejects.toThrow(AdminAccessError);
  });

  it("rejects a role not granted access to the requested section", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      role: "MODERATEUR",
      active: true,
    } as never);

    await expect(requireAdmin("finances")).rejects.toThrow(AdminAccessError);
  });

  it("allows an active admin whose role grants the requested section", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      role: "SUPER_ADMIN",
      active: true,
    } as never);

    await expect(requireAdmin("parametres")).resolves.toEqual({ userId: "user_1" });
  });

  it("defaults to MODERATEUR (and its narrower access) when no AdminUser row exists", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);

    await expect(requireAdmin("finances")).rejects.toThrow(AdminAccessError);
    await expect(requireAdmin("membres")).resolves.toEqual({ userId: "user_1" });
  });
});
