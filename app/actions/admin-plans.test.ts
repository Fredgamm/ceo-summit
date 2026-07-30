import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    plan: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user: { count: vi.fn() },
    membership: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPlan, updatePlan, togglePlanActive, deletePlan, reorderPlans } from "./admin-plans";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const VALID_PLAN_INPUT = {
  name: "Sponsor Or",
  description: "Offre sponsor niveau or",
  scope: "COMPANY" as const,
  priceAr: 5_000_000,
  maxTeamMembers: 20,
  includedCredits: 100,
  hasUnlimitedCredits: false,
  rank: 4,
  eligibilityNote: "",
  isActive: true,
  displayOrder: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  vi.mocked(prisma.user.count).mockResolvedValue(0);
  vi.mocked(prisma.membership.count).mockResolvedValue(0);
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
    const list = ops as Promise<unknown>[];
    return Promise.all(list);
  });
});

describe("createPlan", () => {
  it("creates a plan and logs the action", async () => {
    vi.mocked(prisma.plan.create).mockResolvedValue({ id: "plan_1" } as never);

    const result = await createPlan(VALID_PLAN_INPUT);

    expect(result).toEqual({ success: true, data: { id: "plan_1" } });
    expect(prisma.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Sponsor Or", scope: "COMPANY", rank: 4 }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "plan.create" }) })
    );
  });

  it("rejects invalid input without creating anything", async () => {
    const result = await createPlan({ ...VALID_PLAN_INPUT, name: "a" });
    expect(result.success).toBe(false);
    expect(prisma.plan.create).not.toHaveBeenCalled();
  });
});

describe("updatePlan", () => {
  it("updates a plan and logs the action", async () => {
    const result = await updatePlan("plan_1", VALID_PLAN_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "plan_1" },
        data: expect.objectContaining({ name: "Sponsor Or" }),
      })
    );
  });

  it("rejects an invalid rank without updating anything", async () => {
    const result = await updatePlan("plan_1", { ...VALID_PLAN_INPUT, rank: 0 });
    expect(result.success).toBe(false);
    expect(prisma.plan.update).not.toHaveBeenCalled();
  });
});

describe("togglePlanActive", () => {
  it("deactivates a plan", async () => {
    const result = await togglePlanActive("plan_1", false);
    expect(result.success).toBe(true);
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: "plan_1" },
      data: { isActive: false },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "plan.deactivate" }) })
    );
  });
});

describe("deletePlan", () => {
  it("deletes a plan with no members/memberships attached", async () => {
    const result = await deletePlan("plan_1");
    expect(result.success).toBe(true);
    expect(prisma.plan.delete).toHaveBeenCalledWith({ where: { id: "plan_1" } });
  });

  it("refuses to delete a plan still in use", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(3);
    const result = await deletePlan("plan_1");
    expect(result.success).toBe(false);
    expect(prisma.plan.delete).not.toHaveBeenCalled();
  });
});

describe("reorderPlans", () => {
  it("updates displayOrder for every id in order", async () => {
    const result = await reorderPlans(["plan_b", "plan_a", "plan_c"]);
    expect(result.success).toBe(true);
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: "plan_b" },
      data: { displayOrder: 0 },
    });
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: "plan_a" },
      data: { displayOrder: 1 },
    });
  });
});
