"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import CompanyPaymentConfirmedEmail from "@/emails/company-payment-confirmed-email";
import CompanyPaymentRejectedEmail from "@/emails/company-payment-rejected-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — miroir volontaire de
 * admin-finance.ts::confirmEventPayment : requireAdmin -> fetch -> garde
 * d'idempotence -> update -> auditLog -> email -> revalidatePath. Ne touche
 * PAS User.status — "activer l'accès de l'entreprise" se fait en laissant
 * CompanySubscription.status passer à ACTIVE, lu par middleware.ts (le vrai
 * verrou d'accès plateforme reste le statut du compte lui-même, inchangé).
 */
export async function confirmCompanyPayment(companyPaymentId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("entreprises");

  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    include: {
      companySubscription: {
        include: { company: { include: { companyAdmin: true } } },
      },
    },
  });
  if (!payment) return { success: false, error: "Paiement introuvable." };
  if (payment.status !== "PENDING") {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }

  const now = new Date();
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  await prisma.$transaction([
    prisma.companyPayment.update({
      where: { id: companyPaymentId },
      data: { status: "CONFIRMED", reviewedById: adminId, reviewedAt: now },
    }),
    prisma.companySubscription.update({
      where: { id: payment.companySubscriptionId },
      data: { status: "ACTIVE", startDate: now, endDate: oneYearLater },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "company_payment.confirm",
      targetType: "CompanyPayment",
      targetId: companyPaymentId,
    },
  });

  const companyAdmin = payment.companySubscription.company.companyAdmin;
  if (companyAdmin) {
    await sendTransactionalEmail({
      to: companyAdmin.email,
      subject: `Paiement confirmé — ${payment.companySubscription.company.name}`,
      react: CompanyPaymentConfirmedEmail({
        adminName: companyAdmin.name,
        companyName: payment.companySubscription.company.name,
      }),
    });
  }

  revalidatePath("/admin/entreprises");
  revalidatePath(`/entreprises/${payment.companySubscription.companyId}`);
  return { success: true, data: undefined };
}

export async function rejectCompanyPayment(
  companyPaymentId: string,
  reason: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("entreprises");

  if (!reason.trim()) return { success: false, error: "Un motif est requis." };

  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    include: {
      companySubscription: {
        include: { company: { include: { companyAdmin: true } } },
      },
    },
  });
  if (!payment) return { success: false, error: "Paiement introuvable." };
  if (payment.status !== "PENDING") {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }

  await prisma.$transaction([
    prisma.companyPayment.update({
      where: { id: companyPaymentId },
      data: {
        status: "REJECTED",
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason.trim(),
      },
    }),
    prisma.companySubscription.update({
      where: { id: payment.companySubscriptionId },
      data: { status: "PENDING_PAYMENT" },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "company_payment.reject",
      targetType: "CompanyPayment",
      targetId: companyPaymentId,
      metadata: { reason: reason.trim() },
    },
  });

  const companyAdmin = payment.companySubscription.company.companyAdmin;
  if (companyAdmin) {
    await sendTransactionalEmail({
      to: companyAdmin.email,
      subject: `Paiement à corriger — ${payment.companySubscription.company.name}`,
      react: CompanyPaymentRejectedEmail({
        adminName: companyAdmin.name,
        companyName: payment.companySubscription.company.name,
        reason: reason.trim(),
      }),
    });
  }

  revalidatePath("/admin/entreprises");
  return { success: true, data: undefined };
}

/**
 * Réassignation de l'admin entreprise (décision produit du 30 juillet
 * 2026) : le créateur initial d'une fiche entreprise n'est pas forcément
 * censé le rester (ex. une secrétaire ayant fait les démarches puis le
 * dirigeant reprend la main) — self-service reporté, action back-office
 * suffisante pour la V1.
 */
export async function reassignCompanyAdmin(
  companyId: string,
  newAdminUserId: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("entreprises");

  const newAdmin = await prisma.user.findUnique({ where: { id: newAdminUserId } });
  if (!newAdmin || newAdmin.companyId !== companyId) {
    return { success: false, error: "Ce membre ne fait pas partie de cette entreprise." };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { companyAdminId: newAdminUserId },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "company.reassign_admin",
      targetType: "Company",
      targetId: companyId,
      metadata: { newAdminUserId },
    },
  });

  revalidatePath(`/admin/entreprises/${companyId}`);
  revalidatePath(`/entreprises/${companyId}`);
  return { success: true, data: undefined };
}
