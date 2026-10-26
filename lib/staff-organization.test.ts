import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    company: { findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { attachToStaffOrganization, canManageCompany } from "./staff-organization";

const tx = prisma as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canManageCompany", () => {
  const ADMIN = { id: "u_admin", isPlatformAdmin: true };

  it("lets the manager manage their organization", async () => {
    expect(
      await canManageCompany({ id: "u_1", isPlatformAdmin: false }, { companyAdminId: "u_1" })
    ).toBe(true);
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it("lets an active super admin manage the staff organization", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      role: "SUPER_ADMIN",
      active: true,
    } as never);
    expect(
      await canManageCompany(ADMIN, { companyAdminId: "u_other", isStaffOrganization: true })
    ).toBe(true);
  });

  it("refuses a moderator or a deactivated super admin", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({
      role: "MODERATEUR",
      active: true,
    } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({
      role: "SUPER_ADMIN",
      active: false,
    } as never);
    const staff = { companyAdminId: "u_other", isStaffOrganization: true };
    expect(await canManageCompany(ADMIN, staff)).toBe(false);
    expect(await canManageCompany(ADMIN, staff)).toBe(false);
  });

  it("never opens a client organization to a super admin", async () => {
    expect(
      await canManageCompany(ADMIN, { companyAdminId: "u_other", isStaffOrganization: false })
    ).toBe(false);
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("attachToStaffOrganization", () => {
  it("does nothing for an account already in the staff", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      companyId: "staff",
      companyAdminOf: null,
    } as never);
    expect(await attachToStaffOrganization(tx, "u_1", "staff")).toEqual({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("moves a plain member into the staff", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      companyId: "client",
      companyAdminOf: null,
    } as never);
    expect(await attachToStaffOrganization(tx, "u_1", "staff")).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { companyId: "staff" },
    });
  });

  it("frees an organization the account manages alone", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      companyId: "becom",
      companyAdminOf: { id: "becom", name: "Becom", _count: { users: 0 } },
    } as never);
    expect(await attachToStaffOrganization(tx, "u_1", "staff")).toEqual({ ok: true });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "becom" },
      data: { companyAdminId: null },
    });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it("refuses the manager of an organization that has other members", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      companyId: "client",
      companyAdminOf: { id: "client", name: "Rakoto Holding", _count: { users: 3 } },
    } as never);
    const result = await attachToStaffOrganization(tx, "u_1", "staff");
    expect(result.ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});
