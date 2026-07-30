import type { Plan, PlanScope } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — single place every page/
 * action reads the active offer catalogue from, replacing the "3 fixed
 * tiers" assumption that used to be hardcoded across ~9 filter dropdowns,
 * the event/opportunity forms, and lib/platform-settings.ts.
 */
export async function getActivePlans(scope?: PlanScope): Promise<Plan[]> {
  return prisma.plan.findMany({
    where: { isActive: true, ...(scope ? { scope } : {}) },
    orderBy: [{ displayOrder: "asc" }, { rank: "asc" }],
  });
}

export async function getPlanById(id: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { id } });
}

/** All plans (active + inactive), for the admin list — same ordering as getActivePlans. */
export async function getAllPlans(): Promise<Plan[]> {
  return prisma.plan.findMany({ orderBy: [{ displayOrder: "asc" }, { rank: "asc" }] });
}
