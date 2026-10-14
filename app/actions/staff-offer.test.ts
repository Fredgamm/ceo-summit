import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    companySubscription: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { requireViewer } from "@/lib/require-viewer";
import { prisma } from "@/lib/prisma";
import { activateStaffOffer } from "./staff-offer";

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const STAFF_PLAN = {
  id: "plan_staff",
  isActive: true,
  isSelfService: false,
  isUpsell: false,
  priceAr: 0,
  event: { date: FUTURE },
};

describe("activateStaffOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireViewer).mockResolvedValue({
      success: true,
      viewer: { id: "admin_1", isPlatformAdmin: true },
    } as never);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "admin_1",
      subscription: { planId: "plan_early_bird", status: "PENDING_PAYMENT" },
    } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue(STAFF_PLAN as never);
  });

  it("activates the free staff offer without any payment", async () => {
    const result = await activateStaffOffer("company_1", "plan_staff");

    expect(result.success).toBe(true);
    expect(prisma.companySubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "company_1" },
        update: expect.objectContaining({ planId: "plan_staff", status: "ACTIVE" }),
      })
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("refuses a member who is not a platform admin", async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      success: true,
      viewer: { id: "admin_1", isPlatformAdmin: false },
    } as never);

    const result = await activateStaffOffer("company_1", "plan_staff");

    expect(result.success).toBe(false);
    expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
  });

  it("refuses a paid offer", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      ...STAFF_PLAN,
      isSelfService: true,
      priceAr: 4_000_000,
    } as never);

    const result = await activateStaffOffer("company_1", "plan_staff");

    expect(result.success).toBe(false);
    expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
  });

  it("refuses an offer whose event is already past", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      ...STAFF_PLAN,
      event: { date: new Date("2020-01-01") },
    } as never);

    const result = await activateStaffOffer("company_1", "plan_staff");

    expect(result.success).toBe(false);
  });

  it("refuses an organisation the admin does not manage", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "someone_else",
      subscription: null,
    } as never);

    const result = await activateStaffOffer("company_1", "plan_staff");

    expect(result.success).toBe(false);
  });
});
