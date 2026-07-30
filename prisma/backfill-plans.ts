import { PrismaClient, Tier } from "@prisma/client";

import { DEFAULT_MEMBERSHIP_PRICES, DEFAULT_INCLUDED_CREDITS } from "../lib/platform-settings";

const prisma = new PrismaClient();

/**
 * Phase 0 of the offers/payment rework (30 juillet 2026) — one-off, idempotent
 * backfill run once after the `plan_foundation_isplatformadmin` migration:
 * seeds the 3 legacy tiers as real `Plan` rows (mirroring
 * lib/platform-settings.ts's current hardcoded defaults so nothing changes
 * for existing members), then points every existing Membership/User at the
 * matching Plan. `Membership.tier`/`User.role` are left untouched — this is
 * additive, not a migration off them. Safe to re-run: every step checks
 * before writing.
 */

const LEGACY_PLAN_SEED: Record<Tier, { rank: number; hasUnlimitedCredits: boolean }> = {
  MEMBER: { rank: 1, hasUnlimitedCredits: false },
  EXECUTIVE: { rank: 2, hasUnlimitedCredits: false },
  CHAIRMAN: { rank: 3, hasUnlimitedCredits: true },
};

async function ensureLegacyPlans(): Promise<Record<Tier, string>> {
  const ids: Partial<Record<Tier, string>> = {};

  for (const tier of Object.keys(LEGACY_PLAN_SEED) as Tier[]) {
    const existing = await prisma.plan.findFirst({ where: { name: tier, scope: "INDIVIDUAL" } });
    if (existing) {
      ids[tier] = existing.id;
      continue;
    }
    const { rank, hasUnlimitedCredits } = LEGACY_PLAN_SEED[tier];
    const created = await prisma.plan.create({
      data: {
        name: tier,
        scope: "INDIVIDUAL",
        priceAr: DEFAULT_MEMBERSHIP_PRICES[tier],
        includedCredits: tier === "CHAIRMAN" ? 0 : DEFAULT_INCLUDED_CREDITS[tier],
        hasUnlimitedCredits,
        rank,
        displayOrder: rank,
        isActive: true,
      },
    });
    ids[tier] = created.id;
    console.log(`  + Plan "${tier}" créé (${created.id})`);
  }

  return ids as Record<Tier, string>;
}

async function main() {
  console.log("🌱 Backfill Plan (Phase 0 — offres/paiement)...");

  const planIdByTier = await ensureLegacyPlans();

  for (const tier of Object.keys(planIdByTier) as Tier[]) {
    const membershipResult = await prisma.membership.updateMany({
      where: { tier, planId: null },
      data: { planId: planIdByTier[tier] },
    });
    const userResult = await prisma.user.updateMany({
      where: { role: tier, planId: null },
      data: { planId: planIdByTier[tier] },
    });
    console.log(
      `  ${tier}: ${membershipResult.count} Membership + ${userResult.count} User backfillés`
    );
  }

  const adminResult = await prisma.user.updateMany({
    where: { role: "ADMIN", isPlatformAdmin: false },
    data: { isPlatformAdmin: true },
  });
  console.log(`  ADMIN: ${adminResult.count} User marqués isPlatformAdmin`);

  const remaining = await prisma.user.count({
    where: { role: { in: ["MEMBER", "EXECUTIVE", "CHAIRMAN"] }, planId: null },
  });
  if (remaining > 0) {
    console.warn(`⚠ ${remaining} User avec un tier connu restent sans planId — à investiguer.`);
  }

  console.log("✅ Backfill terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
