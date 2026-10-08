import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/event-auto-registration", () => ({
  autoRegisterCompanyMembers: vi.fn().mockResolvedValue({ registered: 0, full: 0 }),
  syncPlanEventRegistrations: vi.fn().mockResolvedValue({ registered: 0 }),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/currency-conversion", () => ({
  convertEurToAr: vi.fn(async (eur: number) => eur * 5000),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    plan: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    companySubscription: { count: vi.fn() },
    companyPayment: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncPlanEventRegistrations } from "@/lib/event-auto-registration";
import { createPlan, updatePlan, togglePlanActive, deletePlan, reorderPlans } from "./admin-plans";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const VALID_PLAN_INPUT = {
  name: "Sponsor Or",
  slug: "sponsor-or",
  description: "Offre sponsor niveau or",
  pricingMode: "FIXED_BUNDLE" as const,
  priceAr: 5_000_000,
  priceEur: null,
  maxTeamMembers: 20,
  minParticipants: null,
  eligibilityNote: "",
  isActive: true,
  isSelfService: true,
  displayOrder: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  vi.mocked(prisma.plan.count).mockResolvedValue(0);
  vi.mocked(prisma.companySubscription.count).mockResolvedValue(0);
  vi.mocked(prisma.companyPayment.count).mockResolvedValue(0);
  vi.mocked(prisma.plan.findUnique).mockResolvedValue(null);
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
        data: expect.objectContaining({ name: "Sponsor Or", maxTeamMembers: 20 }),
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

  it("rejects a slug already used by another plan", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ id: "other_plan" } as never);
    const result = await createPlan(VALID_PLAN_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.plan.create).not.toHaveBeenCalled();
  });

  function createdData() {
    return (vi.mocked(prisma.plan.create).mock.calls[0]?.[0] as { data: Record<string, unknown> })
      .data;
  }

  it("keeps the client priceAr for an offer priced directly in Ariary", async () => {
    vi.mocked(prisma.plan.create).mockResolvedValue({ id: "plan_1" } as never);
    await createPlan(VALID_PLAN_INPUT);
    expect(createdData()).toMatchObject({ priceAr: 5_000_000, priceEur: null });
  });

  it("recomputes priceAr server-side from priceEur, ignoring the client priceAr", async () => {
    vi.mocked(prisma.plan.create).mockResolvedValue({ id: "plan_1" } as never);
    await createPlan({ ...VALID_PLAN_INPUT, priceEur: 720, priceAr: 1 });
    expect(createdData()).toMatchObject({ priceAr: 3_600_000, priceEur: 720 });
  });

  it("treats priceEur = 0 as a euro price (0 Ar), not as a fallback to the client priceAr", async () => {
    vi.mocked(prisma.plan.create).mockResolvedValue({ id: "plan_1" } as never);
    await createPlan({ ...VALID_PLAN_INPUT, priceEur: 0, priceAr: 5_000_000 });
    expect(createdData()).toMatchObject({ priceAr: 0, priceEur: 0 });
  });

  it("clears minParticipants on a fixed-bundle offer", async () => {
    vi.mocked(prisma.plan.create).mockResolvedValue({ id: "plan_1" } as never);
    await createPlan({ ...VALID_PLAN_INPUT, minParticipants: 10 });
    expect(createdData()).toMatchObject({ maxTeamMembers: 20, minParticipants: null });
  });

  it("clears maxTeamMembers on a Groupement offer (its quota is the declared headcount)", async () => {
    vi.mocked(prisma.plan.create).mockResolvedValue({ id: "plan_1" } as never);
    await createPlan({
      ...VALID_PLAN_INPUT,
      pricingMode: "PER_PARTICIPANT",
      minParticipants: 10,
      maxTeamMembers: 20,
    });
    expect(createdData()).toMatchObject({ maxTeamMembers: null, minParticipants: 10 });
  });

  it("strips markdown asterisks from the offer name", async () => {
    vi.mocked(prisma.plan.create).mockResolvedValue({ id: "plan_1" } as never);
    await createPlan({ ...VALID_PLAN_INPUT, name: "Early Bird** (fin : 31 déc 2026)" });
    expect(createdData()).toMatchObject({ name: "Early Bird (fin : 31 déc 2026)" });
  });

  it("rejects a name made only of asterisks", async () => {
    const result = await createPlan({ ...VALID_PLAN_INPUT, name: "****" });
    expect(result.success).toBe(false);
    expect(prisma.plan.create).not.toHaveBeenCalled();
  });
});

describe("updatePlan", () => {
  it("registers the offer's members when the offer is linked to an event (module 21)", async () => {
    vi.mocked(prisma.plan.findUnique)
      .mockResolvedValueOnce(null) // slug libre
      .mockResolvedValueOnce({ eventId: null } as never); // avant la mise à jour
    vi.mocked(prisma.plan.update).mockResolvedValue({ eventId: "event_1" } as never);

    await updatePlan("plan_1", VALID_PLAN_INPUT);

    expect(syncPlanEventRegistrations).toHaveBeenCalledWith("plan_1", null, "event_1");
  });

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

  it("rejects a fixed-bundle offer with no seat count, without updating anything", async () => {
    const result = await updatePlan("plan_1", { ...VALID_PLAN_INPUT, maxTeamMembers: null });
    expect(result.success).toBe(false);
    expect(prisma.plan.update).not.toHaveBeenCalled();
  });

  it("rejects a group offer with no minimum headcount", async () => {
    const result = await updatePlan("plan_1", {
      ...VALID_PLAN_INPUT,
      pricingMode: "PER_PARTICIPANT",
      minParticipants: null,
    });
    expect(result.success).toBe(false);
    expect(prisma.plan.update).not.toHaveBeenCalled();
  });

  it("allows keeping the same slug on the plan being edited", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ id: "plan_1" } as never);
    const result = await updatePlan("plan_1", VALID_PLAN_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a slug already used by a different plan", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ id: "other_plan" } as never);
    const result = await updatePlan("plan_1", VALID_PLAN_INPUT);
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
  it("deletes a plan with no linked event offers attached", async () => {
    const result = await deletePlan("plan_1");
    expect(result.success).toBe(true);
    expect(prisma.plan.delete).toHaveBeenCalledWith({ where: { id: "plan_1" } });
  });

  it("refuses to delete a platform plan still referenced by an event offer", async () => {
    vi.mocked(prisma.plan.count).mockResolvedValue(2);
    const result = await deletePlan("plan_1");
    expect(result.success).toBe(false);
    expect(prisma.plan.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a plan a company is subscribed to, suggesting deactivation", async () => {
    vi.mocked(prisma.companySubscription.count).mockResolvedValue(3);
    const result = await deletePlan("plan_1");
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("désactive-la"),
    });
    expect(prisma.companySubscription.count).toHaveBeenCalledWith({ where: { planId: "plan_1" } });
    expect(prisma.plan.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a plan bought as a supplement", async () => {
    vi.mocked(prisma.companyPayment.count).mockResolvedValue(1);
    const result = await deletePlan("plan_1");
    expect(result.success).toBe(false);
    expect(prisma.companyPayment.count).toHaveBeenCalledWith({
      where: { upsellPlanId: "plan_1" },
    });
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
