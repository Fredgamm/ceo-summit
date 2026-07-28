"use server";

import { revalidatePath } from "next/cache";
import type { Tier } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E8-T04 — gestion membres : changer tier, suspendre/exclure/réactiver,
 * attribuer des crédits, note interne. All actions revalidate the member's
 * own detail page since that's the only place they're called from today.
 */

export async function changeMemberTier(userId: string, tier: Tier): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("membres");

  const activeMembership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { endDate: "desc" },
  });

  if (activeMembership) {
    await prisma.membership.update({ where: { id: activeMembership.id }, data: { tier } });
  } else {
    // No active membership to adjust (e.g. a candidature-approved account that
    // hasn't paid via Evolia yet) — an admin-granted one, price 0, 1 year.
    await prisma.membership.create({
      data: {
        userId,
        tier,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "ACTIVE",
        price: 0,
      },
    });
  }

  await prisma.user.update({ where: { id: userId }, data: { role: tier } });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "member.change_tier",
      targetType: "User",
      targetId: userId,
      metadata: { tier },
    },
  });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}

async function setMemberStatus(
  userId: string,
  status: "SUSPENDED" | "CANCELLED" | "ACTIVE",
  action: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("membres");

  await prisma.user.update({ where: { id: userId }, data: { status } });
  await prisma.auditLog.create({
    data: { actorId: adminId, action, targetType: "User", targetId: userId },
  });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}

export const suspendMember = (userId: string) =>
  setMemberStatus(userId, "SUSPENDED", "member.suspend");
export const excludeMember = (userId: string) =>
  setMemberStatus(userId, "CANCELLED", "member.exclude");
export const reactivateMember = (userId: string) =>
  setMemberStatus(userId, "ACTIVE", "member.reactivate");

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("membres");

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Le nombre de crédits doit être positif." };
  }

  await prisma.creditBalance.upsert({
    where: { userId },
    update: { purchased: { increment: amount } },
    create: { userId, included: 0, purchased: amount, used: 0 },
  });

  await prisma.creditTransaction.create({
    data: { userId, amount, type: "ADMIN_GRANT", reason: reason || undefined },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "member.grant_credits",
      targetType: "User",
      targetId: userId,
      metadata: { amount, reason },
    },
  });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}

export async function saveMemberNote(userId: string, note: string): Promise<ActionResult> {
  await requireAdmin("membres");

  await prisma.user.update({ where: { id: userId }, data: { adminNote: note } });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}
