"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { planFormSchema } from "@/lib/validations/plan";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — "offres créables librement
 * par l'admin", remplace à terme l'enum `Tier`. Même forme que
 * app/actions/admin-rooms.ts : requireAdmin -> Zod -> Prisma -> auditLog ->
 * revalidatePath.
 */

function toPlanData(f: ReturnType<typeof planFormSchema.parse>) {
  return {
    name: f.name,
    slug: f.slug,
    description: f.description || null,
    scope: f.scope,
    priceAr: f.priceAr,
    maxTeamMembers: f.maxTeamMembers ?? null,
    minParticipants: f.minParticipants ?? null,
    includedCredits: f.includedCredits,
    hasUnlimitedCredits: f.hasUnlimitedCredits,
    rank: f.rank,
    eligibilityNote: f.eligibilityNote || null,
    isActive: f.isActive,
    isSelfService: f.isSelfService,
    displayOrder: f.displayOrder,
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

  const plan = await prisma.plan.create({ data: toPlanData(parsed.data) });
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

  await prisma.plan.update({ where: { id: planId }, data: toPlanData(parsed.data) });
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
 * Suppression bloquée si le plan est référencé par au moins un membre/une
 * adhésion — même logique "archiver, pas détruire" que archiveRoom : on
 * propose de désactiver (togglePlanActive) plutôt que de casser des FK.
 */
export async function deletePlan(planId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  const [userCount, membershipCount] = await Promise.all([
    prisma.user.count({ where: { planId } }),
    prisma.membership.count({ where: { planId } }),
  ]);
  if (userCount > 0 || membershipCount > 0) {
    return {
      success: false,
      error: `Ce plan est utilisé par ${userCount} membre(s)/${membershipCount} adhésion(s) — désactive-le au lieu de le supprimer.`,
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
