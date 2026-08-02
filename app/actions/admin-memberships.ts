"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { syncUserPlanCache } from "@/lib/membership-sync";
import { sendTransactionalEmail } from "@/lib/resend";
import MembershipPaymentConfirmedEmail from "@/emails/membership-payment-confirmed-email";
import MembershipPaymentRejectedEmail from "@/emails/membership-payment-rejected-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 2ter (1er août 2026) — miroir volontaire d'admin-companies.ts::
 * confirmCompanyPayment : requireAdmin -> fetch -> garde d'idempotence ->
 * update -> syncUserPlanCache -> crédits -> auditLog -> email -> revalidatePath.
 * Contrairement au pool de crédits entreprise (Phase 3, pas encore posé),
 * une adhésion individuelle ne concerne qu'une seule personne : aucune
 * ambiguïté de répartition, les crédits inclus de l'offre sont accordés
 * directement ici.
 */
export async function confirmMembershipPayment(membershipPaymentId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("adhesions");

  const payment = await prisma.membershipPayment.findUnique({
    where: { id: membershipPaymentId },
    include: { membership: { include: { user: true, plan: true } } },
  });
  if (!payment) return { success: false, error: "Paiement introuvable." };
  if (payment.status !== "PENDING") {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }
  if (!payment.membership.plan) {
    return { success: false, error: "Offre introuvable pour cette adhésion." };
  }

  const now = new Date();
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  const plan = payment.membership.plan;

  await prisma.$transaction([
    prisma.membershipPayment.update({
      where: { id: membershipPaymentId },
      data: { status: "CONFIRMED", reviewedById: adminId, reviewedAt: now },
    }),
    prisma.membership.update({
      where: { id: payment.membershipId },
      data: { status: "ACTIVE", startDate: now, endDate: oneYearLater },
    }),
  ]);

  await syncUserPlanCache(payment.membership.userId, plan.id);

  await prisma.creditBalance.upsert({
    where: { userId: payment.membership.userId },
    update: {
      included: plan.hasUnlimitedCredits ? 999999 : plan.includedCredits,
      used: 0,
      resetAt: oneYearLater,
    },
    create: {
      userId: payment.membership.userId,
      included: plan.hasUnlimitedCredits ? 999999 : plan.includedCredits,
      purchased: 0,
      used: 0,
      resetAt: oneYearLater,
    },
  });

  /**
   * Phase 2quater (1er août 2026) — une offre rattachée à un évènement
   * (Plan.eventId) inscrit automatiquement l'acheteur à cet évènement,
   * sans étape séparée à refaire. upsert plutôt que create : idempotent
   * sur la contrainte [eventId, userId] si jamais déjà inscrit autrement.
   */
  if (plan.eventId) {
    await prisma.eventRegistration.upsert({
      where: { eventId_userId: { eventId: plan.eventId, userId: payment.membership.userId } },
      update: { status: "CONFIRMED", paymentStatus: "PAID", planId: plan.id },
      create: {
        eventId: plan.eventId,
        userId: payment.membership.userId,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        planId: plan.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "membership_payment.confirm",
      targetType: "MembershipPayment",
      targetId: membershipPaymentId,
    },
  });

  try {
    await sendTransactionalEmail({
      to: payment.membership.user.email,
      subject: `Paiement confirmé — ${plan.name}`,
      react: MembershipPaymentConfirmedEmail({
        memberName: payment.membership.user.name,
        planName: plan.name,
      }),
    });
  } catch (err) {
    console.error("[confirmMembershipPayment] failed to send confirmation email", err);
  }

  revalidatePath("/admin/adhesions");
  revalidatePath("/paiement-en-attente");
  return { success: true, data: undefined };
}

export async function rejectMembershipPayment(
  membershipPaymentId: string,
  reason: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("adhesions");

  if (!reason.trim()) return { success: false, error: "Un motif est requis." };

  const payment = await prisma.membershipPayment.findUnique({
    where: { id: membershipPaymentId },
    include: { membership: { include: { user: true, plan: true } } },
  });
  if (!payment) return { success: false, error: "Paiement introuvable." };
  if (payment.status !== "PENDING") {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }

  await prisma.$transaction([
    prisma.membershipPayment.update({
      where: { id: membershipPaymentId },
      data: {
        status: "REJECTED",
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason.trim(),
      },
    }),
    prisma.membership.update({
      where: { id: payment.membershipId },
      data: { status: "PENDING_PAYMENT" },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "membership_payment.reject",
      targetType: "MembershipPayment",
      targetId: membershipPaymentId,
      metadata: { reason: reason.trim() },
    },
  });

  try {
    await sendTransactionalEmail({
      to: payment.membership.user.email,
      subject: `Paiement à corriger — ${payment.membership.plan?.name ?? "votre adhésion"}`,
      react: MembershipPaymentRejectedEmail({
        memberName: payment.membership.user.name,
        planName: payment.membership.plan?.name ?? "votre adhésion",
        reason: reason.trim(),
      }),
    });
  } catch (err) {
    console.error("[rejectMembershipPayment] failed to send rejection email", err);
  }

  revalidatePath("/admin/adhesions");
  return { success: true, data: undefined };
}
