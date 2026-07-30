import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    platformSetting: { upsert: vi.fn() },
    creditPackPrice: { upsert: vi.fn() },
    referential: {
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  saveMembershipTariffs,
  saveCreditPackPrices,
  createReferentialItem,
  deleteReferentialItem,
  promoteToAdmin,
  updateAdminRole,
  toggleAdminActive,
} from "./admin-settings";

const SUPER_ADMIN_SESSION = {
  user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(SUPER_ADMIN_SESSION);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
    const list = ops as Promise<unknown>[];
    return Promise.all(list);
  });
});

describe("saveMembershipTariffs", () => {
  it("upserts a PlatformSetting row per tier and per credit rule", async () => {
    const result = await saveMembershipTariffs(
      { MEMBER: "250000", EXECUTIVE: "650000", CHAIRMAN: "1600000" },
      { MEMBER: "1", EXECUTIVE: "12" }
    );

    expect(result.success).toBe(true);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "membership_price_chairman" } })
    );
  });

  it("rejects an invalid price", async () => {
    const result = await saveMembershipTariffs(
      { MEMBER: "not-a-number", EXECUTIVE: "650000", CHAIRMAN: "1600000" },
      { MEMBER: "1", EXECUTIVE: "12" }
    );
    expect(result.success).toBe(false);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("denies a non-SUPER_ADMIN", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "FINANCIER" } as never);
    await expect(
      saveMembershipTariffs(
        { MEMBER: "1", EXECUTIVE: "1", CHAIRMAN: "1" },
        { MEMBER: "1", EXECUTIVE: "1" }
      )
    ).rejects.toThrow();
  });
});

describe("saveCreditPackPrices", () => {
  it("upserts each pack", async () => {
    const result = await saveCreditPackPrices([
      { credits: 1, priceAr: "50000" },
      { credits: 5, priceAr: "200000" },
    ]);
    expect(result.success).toBe(true);
    expect(prisma.creditPackPrice.upsert).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid pack price", async () => {
    const result = await saveCreditPackPrices([{ credits: 1, priceAr: "-5" }]);
    expect(result.success).toBe(false);
    expect(prisma.creditPackPrice.upsert).not.toHaveBeenCalled();
  });
});

describe("createReferentialItem", () => {
  it("creates a new item at the next position", async () => {
    vi.mocked(prisma.referential.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.referential.aggregate).mockResolvedValue({ _max: { position: 2 } } as never);
    vi.mocked(prisma.referential.create).mockResolvedValue({ id: "ref_1" } as never);

    const result = await createReferentialItem("sector", "Fintech");

    expect(result).toEqual({ success: true, data: { id: "ref_1" } });
    expect(prisma.referential.create).toHaveBeenCalledWith({
      data: { type: "sector", label: "Fintech", position: 3 },
    });
  });

  it("rejects a duplicate label for the same type", async () => {
    vi.mocked(prisma.referential.findFirst).mockResolvedValue({ id: "ref_existing" } as never);
    const result = await createReferentialItem("sector", "Fintech");
    expect(result.success).toBe(false);
    expect(prisma.referential.create).not.toHaveBeenCalled();
  });

  it("rejects an empty label", async () => {
    const result = await createReferentialItem("country", "   ");
    expect(result.success).toBe(false);
  });
});

describe("deleteReferentialItem", () => {
  it("deletes by id", async () => {
    const result = await deleteReferentialItem("ref_1");
    expect(result.success).toBe(true);
    expect(prisma.referential.delete).toHaveBeenCalledWith({ where: { id: "ref_1" } });
  });
});

describe("promoteToAdmin", () => {
  it("promotes an existing member to admin", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_2" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce(null);

    const result = await promoteToAdmin("new-admin@example.com", "MODERATEUR");

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("rejects when no member exists with that email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const result = await promoteToAdmin("nobody@example.com", "MODERATEUR");
    expect(result.success).toBe(false);
  });

  it("rejects a member who is already an admin", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_2" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ id: "admin_existing" } as never);

    const result = await promoteToAdmin("already-admin@example.com", "MODERATEUR");
    expect(result.success).toBe(false);
  });
});

describe("updateAdminRole", () => {
  it("updates the role", async () => {
    const result = await updateAdminRole("admin_2", "FINANCIER");
    expect(result.success).toBe(true);
    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: "admin_2" },
      data: { role: "FINANCIER" },
    });
  });
});

describe("toggleAdminActive", () => {
  it("deactivates another admin", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({
      id: "admin_2",
      userId: "user_2",
      active: true,
    } as never);

    const result = await toggleAdminActive("admin_2");

    expect(result.success).toBe(true);
    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: "admin_2" },
      data: { active: false },
    });
  });

  it("refuses to let an admin deactivate themselves", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({
      id: "admin_1_self",
      userId: "admin_1",
      active: true,
    } as never);

    const result = await toggleAdminActive("admin_1_self");

    expect(result.success).toBe(false);
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown admin id", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce(null);

    const result = await toggleAdminActive("admin_x");
    expect(result.success).toBe(false);
  });
});
