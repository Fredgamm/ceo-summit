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
        include: {
          plan: { include: { linkedPlatformPlan: true } },
          company: { include: { companyAdmin: true, users: { select: { id: true } } } },
        },
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

  /**
   * Phase 2quater (1er août 2026) — même effet de bord que
   * confirmMembershipPayment, mais pour chaque membre déjà rattaché à
   * l'entreprise au moment de la confirmation (pas les invitations encore
   * en attente) — un collaborateur invité après coup n'est pas
   * rétroactivement inscrit à l'évènement (RG-14 couvre ce cas séparément,
   * à l'acceptation de l'invitation).
   */
  const plan = payment.companySubscription.plan;
  if (plan.eventId) {
    const eventId = plan.eventId;
    await Promise.all(
      payment.companySubscription.company.users.map((u) =>
        prisma.eventRegistration.upsert({
          where: { eventId_userId: { eventId, userId: u.id } },
          update: { status: "CONFIRMED", paymentStatus: "PAID", planId: plan.id },
          create: {
            eventId,
            userId: u.id,
            status: "CONFIRMED",
            paymentStatus: "PAID",
            planId: plan.id,
          },
        })
      )
    );
  }

  /**
   * RG-09 (4 août 2026) — les avantages plateforme (crédits Deal Room)
   * viennent de l'offre plateforme liée (`linkedPlatformPlan`), jamais de
   * l'offre d'évènement elle-même ; repli sur l'offre payée directement si
   * aucun lien n'est renseigné (offre plateforme achetée sans passer par un
   * évènement). Attribué à chaque collaborateur déjà rattaché à
   * l'entreprise — même mécanique que confirmMembershipPayment, simplement
   * appliquée à tous les membres plutôt qu'à un seul individu. La
   * répartition d'un pool distinct entre collaborateurs reste hors
   * périmètre (Phase 3).
   */
  const benefitPlan = plan.linkedPlatformPlan ?? plan;
  const includedCredits = benefitPlan.hasUnlimitedCredits ? 999999 : benefitPlan.includedCredits;
  await Promise.all(
    payment.companySubscription.company.users.map((u) =>
      prisma.creditBalance.upsert({
        where: { userId: u.id },
        update: { included: includedCredits, used: 0, resetAt: oneYearLater },
        create: {
          userId: u.id,
          included: includedCredits,
          purchased: 0,
          used: 0,
          resetAt: oneYearLater,
        },
      })
    )
  );

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
    try {
      await sendTransactionalEmail({
        to: companyAdmin.email,
        subject: `Paiement confirmé — ${payment.companySubscription.company.name}`,
        react: CompanyPaymentConfirmedEmail({
          adminName: companyAdmin.name,
          companyName: payment.companySubscription.company.name,
        }),
      });
    } catch (err) {
      // Le paiement est déjà confirmé et l'abonnement déjà actif à ce
      // stade — un échec d'envoi ne doit pas faire échouer l'action (même
      // bug de classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[confirmCompanyPayment] failed to send confirmation email", err);
    }
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
