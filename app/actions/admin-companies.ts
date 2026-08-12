"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmCompanyPaymentCore } from "@/lib/payment-confirmations";
import { sendTransactionalEmail } from "@/lib/resend";
import CompanyPaymentRejectedEmail from "@/emails/company-payment-rejected-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — requireAdmin puis délègue à
 * `confirmCompanyPaymentCore` (lib/payment-confirmations.ts), partagée avec
 * le webhook paiement générique (7 août 2026) — un prestataire externe peut
 * confirmer automatiquement, ce clic manuel reste le chemin de repli.
 */
export async function confirmCompanyPayment(companyPaymentId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("entreprises");
  const result = await confirmCompanyPaymentCore(companyPaymentId, adminId);
  if (!result.success) return result;

  revalidatePath("/admin/entreprises");
  revalidatePath(`/entreprises/${result.data.companyId}`);
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
    try {
      await sendTransactionalEmail({
        to: companyAdmin.email,
        subject: `Paiement à corriger — ${payment.companySubscription.company.name}`,
        react: CompanyPaymentRejectedEmail({
          adminName: companyAdmin.name,
          companyName: payment.companySubscription.company.name,
          reason: reason.trim(),
        }),
      });
    } catch (err) {
      // Même rationale que confirmCompanyPayment ci-dessus.
      console.error("[rejectCompanyPayment] failed to send rejection email", err);
    }
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
