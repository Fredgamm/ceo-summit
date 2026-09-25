import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { cleanPlanName, getActivePlans, getPlanBySlug } from "./plans-query";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.plan.findMany).mockResolvedValue([]);
  vi.mocked(prisma.plan.findFirst).mockResolvedValue(null);
});

function whereOf(fn: typeof prisma.plan.findMany | typeof prisma.plan.findFirst) {
  return (vi.mocked(fn).mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
}

describe("getActivePlans", () => {
  it("excludes supplement offers (isUpsell) from the self-service catalogue", async () => {
    await getActivePlans({ selfServiceOnly: true });
    expect(whereOf(prisma.plan.findMany)).toEqual({
      isActive: true,
      isSelfService: true,
      isUpsell: false,
      eventId: null,
    });
  });

  it("keeps every active plan (supplements and sponsoring included) for admin views", async () => {
    await getActivePlans();
    expect(whereOf(prisma.plan.findMany)).toEqual({ isActive: true, eventId: null });
  });
});

describe("getPlanBySlug", () => {
  it("never resolves a supplement offer as the main offer of a deep link", async () => {
    await getPlanBySlug("executive-pass");
    expect(whereOf(prisma.plan.findFirst)).toEqual({
      slug: "executive-pass",
      isActive: true,
      isSelfService: true,
      isUpsell: false,
    });
  });
});

describe("cleanPlanName", () => {
  it("strips markdown asterisks typed into an offer name", () => {
    expect(cleanPlanName("Early Bird** (fin : 31 déc 2026)")).toBe(
      "Early Bird (fin : 31 déc 2026)"
    );
    expect(cleanPlanName("**Premium**")).toBe("Premium");
  });

  it("leaves a clean name untouched", () => {
    expect(cleanPlanName("Groupement 10+")).toBe("Groupement 10+");
  });
});
