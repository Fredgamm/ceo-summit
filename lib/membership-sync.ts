import { prisma } from "@/lib/prisma";

/**
 * Phase 0 of the offers/payment rework (30 juillet 2026) — single write path
 * for `User.planId`, the denormalized "current plan" cache. Before this,
 * `User.role` served the same caching purpose but was kept in sync by two
 * independent call sites (the Evolia webhook and the admin tier-change
 * action) doing their own `prisma.user.update`, with no shared function
 * enforcing they stayed in lockstep. Every write path that changes a user's
 * plan must go through this function instead of writing `planId` directly.
 */
export async function syncUserPlanCache(userId: string, planId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { planId } });
}
