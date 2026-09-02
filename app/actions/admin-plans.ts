"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { planFormSchema } from "@/lib/validations/plan";
import { convertEurToAr } from "@/lib/currency-conversion";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — "offres créables librement
 * par l'admin", remplace à terme l'enum `Tier`. Même forme que
 * app/actions/admin-rooms.ts : requireAdmin -> Zod -> Prisma -> auditLog ->
 * revalidatePath.
 */

/**
 * 3 septembre 2026 — une offre cotée en euros voit son `priceAr` recalculé
 * côté serveur au taux du jour à chaque création/modification (jamais une
 * valeur envoyée par le client) ; `priceAr` reste la seule valeur lue pour
 * tout calcul de montant dû, `priceEur` n'est qu'informatif à l'affichage.
 */
async function toPlanData(f: ReturnType<typeof planFormSchema.parse>) {
  const priceAr = f.priceEur ? await convertEurToAr(f.priceEur) : f.priceAr;
  return {
    name: f.name,
    slug: f.slug,
    description: f.description || null,
    priceAr,
    priceEur: f.priceEur ?? null,
    maxTeamMembers: f.maxTeamMembers ?? null,
    minParticipants: f.minParticipants ?? null,
    pricingMode: f.pricingMode ?? null,
    includedSeats: f.includedSeats ?? null,
    includedCredits: f.includedCredits,
    hasUnlimitedCredits: f.hasUnlimitedCredits,
    rank: f.rank,
    eligibilityNote: f.eligibilityNote || null,
    isActive: f.isActive,
    isSelfService: f.isSelfService,
    displayOrder: f.displayOrder,
    eventId: f.eventId || null,
    linkedPlatformPlanId: f.linkedPlatformPlanId || null,
  };
}

export async function createPlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { userId: adminId } = await requireAdmin("plans");

  const parsed = planFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const existingSlug = await prisma.plan.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug) {
    return { success: false, error: "Ce slug est déjà utilisé par une autre offre." };
  }

  const plan = await prisma.plan.create({ data: await toPlanData(parsed.data) });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.create", targetType: "Plan", targetId: plan.id },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: { id: plan.id } };
}

export async function updatePlan(planId: string, input: unknown): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  const parsed = planFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const existingSlug = await prisma.plan.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug && existingSlug.id !== planId) {
    return { success: false, error: "Ce slug est déjà utilisé par une autre offre." };
  }

  await prisma.plan.update({ where: { id: planId }, data: await toPlanData(parsed.data) });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.update", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
  revalidatePath(`/admin/plans/${planId}/editer`);
  return { success: true, data: undefined };
}

export async function togglePlanActive(planId: string, isActive: boolean): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  await prisma.plan.update({ where: { id: planId }, data: { isActive } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: isActive ? "plan.activate" : "plan.deactivate",
      targetType: "Plan",
      targetId: planId,
    },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: undefined };
}

/**
 * Suppression bloquée si le plan est référencé par une offre d'évènement
 * qui en hérite les avantages (RG-13, 4 août 2026) — même logique
 * "archiver, pas détruire" que archiveRoom : on propose de désactiver
 * (togglePlanActive) plutôt que de casser des FK.
 *
 * Correctif (7 août 2026, audit) — cette fonction vérifiait aussi
 * `User.planId`, une colonne jamais écrite depuis la bascule Tier->Plan
 * (4 août 2026, voir prisma/schema.prisma) et supprimée dans ce même
 * correctif : ce volet de la garde ne bloquait donc jamais rien en
 * pratique (toujours 0), seul `linkedPlatformPlanId` reste un vrai risque.
 */
export async function deletePlan(planId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  const linkedOffersCount = await prisma.plan.count({ where: { linkedPlatformPlanId: planId } });
  if (linkedOffersCount > 0) {
    return {
      success: false,
      error: `Ce plan est utilisé par ${linkedOffersCount} offre(s) d'évènement — désactive-le au lieu de le supprimer.`,
    };
  }

  await prisma.plan.delete({ where: { id: planId } });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.delete", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: undefined };
}

/** Réordonnancement en masse depuis un drag-and-drop de la liste admin. */
export async function reorderPlans(orderedIds: string[]): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.plan.update({ where: { id }, data: { displayOrder: index } })
    )
  );
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.reorder", targetType: "Plan", targetId: "bulk" },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: undefined };
}
