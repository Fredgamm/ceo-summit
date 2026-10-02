import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    creditPackPrice: { upsert: vi.fn() },
    platformSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    referential: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    company: { count: vi.fn() },
    opportunity: { count: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  saveCreditPackPrices,
  updateDealRoomContactCost,
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

// saveMembershipTariffs retiré (Phase 1 offres dynamiques, 30 juillet 2026)
// — voir app/actions/admin-plans.test.ts pour la couverture équivalente sur
// le CRUD Plan qui l'a remplacé.

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

describe("updateDealRoomContactCost", () => {
  it("stores the new cost and logs an audit entry", async () => {
    const result = await updateDealRoomContactCost(0);

    expect(result.success).toBe(true);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith({
      where: { key: "deal_room_contact_cost" },
      update: { value: "0" },
      create: { key: "deal_room_contact_cost", value: "0" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "settings.update_deal_room_contact_cost",
          metadata: { cost: 0 },
        }),
      })
    );
  });

  it("rejects a negative cost", async () => {
    const result = await updateDealRoomContactCost(-1);
    expect(result.success).toBe(false);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-integer cost", async () => {
    const result = await updateDealRoomContactCost(1.5);
    expect(result.success).toBe(false);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
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
  const FINTECH = { id: "ref_1", type: "sector", label: "Fintech" };

  beforeEach(() => {
    vi.mocked(prisma.company.count).mockResolvedValue(0);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
  });

  it("deletes an unused sector", async () => {
    vi.mocked(prisma.referential.findUnique).mockResolvedValue(FINTECH as never);
    const result = await deleteReferentialItem("ref_1");
    expect(result.success).toBe(true);
    expect(prisma.referential.delete).toHaveBeenCalledWith({ where: { id: "ref_1" } });
  });

  it("rejects an unknown item", async () => {
    vi.mocked(prisma.referential.findUnique).mockResolvedValue(null);
    const result = await deleteReferentialItem("ref_x");
    expect(result.success).toBe(false);
    expect(prisma.referential.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a sector still used by a company", async () => {
    vi.mocked(prisma.referential.findUnique).mockResolvedValue(FINTECH as never);
    vi.mocked(prisma.company.count).mockResolvedValue(2);
    const result = await deleteReferentialItem("ref_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("2 fiches");
    expect(prisma.referential.delete).not.toHaveBeenCalled();
  });

  it("counts a member's sectors of interest as a use of the sector", async () => {
    vi.mocked(prisma.referential.findUnique).mockResolvedValue(FINTECH as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    const result = await deleteReferentialItem("ref_1");
    expect(result.success).toBe(false);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { sectors: { has: "Fintech" } } });
  });

  it("checks only opportunities for an opportunity type", async () => {
    vi.mocked(prisma.referential.findUnique).mockResolvedValue({
      id: "ref_2",
      type: "opportunity_type",
      label: "Partenariat",
    } as never);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(1);
    const result = await deleteReferentialItem("ref_2");
    expect(result.success).toBe(false);
    expect(prisma.company.count).not.toHaveBeenCalled();
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
  function mockTarget(target: { userId: string; role: string } | null) {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce(target as never);
  }

  it("updates the role", async () => {
    mockTarget({ userId: "user_2", role: "MODERATEUR" });
    const result = await updateAdminRole("admin_2", "FINANCIER");
    expect(result.success).toBe(true);
    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: "admin_2" },
      data: { role: "FINANCIER" },
    });
  });

  it("refuses to change the acting admin's own role", async () => {
    mockTarget({ userId: "admin_1", role: "SUPER_ADMIN" });
    const result = await updateAdminRole("admin_self", "MODERATEUR");
    expect(result.success).toBe(false);
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it("refuses to demote the last active super-admin", async () => {
    mockTarget({ userId: "user_2", role: "SUPER_ADMIN" });
    vi.mocked(prisma.adminUser.count).mockResolvedValue(0);
    const result = await updateAdminRole("admin_2", "MODERATEUR");
    expect(result.success).toBe(false);
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it("allows demoting a super-admin when another active one remains", async () => {
    mockTarget({ userId: "user_2", role: "SUPER_ADMIN" });
    vi.mocked(prisma.adminUser.count).mockResolvedValue(1);
    const result = await updateAdminRole("admin_2", "MODERATEUR");
    expect(result.success).toBe(true);
  });

  it("returns an error for an unknown admin account", async () => {
    mockTarget(null);
    const result = await updateAdminRole("ghost", "MODERATEUR");
    expect(result.success).toBe(false);
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
