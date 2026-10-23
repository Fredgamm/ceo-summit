"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { isEvoliaLive } from "@/lib/evolia-config";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmCompanyPaymentCore } from "@/lib/payment-confirmations";
import { deliverEvoliaPush, pushParticipantsToEvolia } from "@/lib/evolia";
import { sendTransactionalEmail } from "@/lib/resend";
import { resolveEmail } from "@/lib/email-template-resolver";

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
  revalidatePath(`/admin/entreprises/${result.data.companyId}`);
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

  /**
   * 22 septembre 2026 (`conception/12` §3.2) — refuser un supplément ne
   * doit pas toucher l'abonnement, déjà actif et sans rapport avec ce
   * paiement-là (contrairement au refus du paiement initial, qui repasse
   * bien l'abonnement en attente).
   */
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
    ...(payment.upsellQuantity == null
      ? [
          prisma.companySubscription.update({
            where: { id: payment.companySubscriptionId },
            data: { status: "PENDING_PAYMENT" as const },
          }),
        ]
      : []),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "company_payment.reject",
      targetType: "CompanyPayment",
      targetId: companyPaymentId,
      metadata: {
        reason: reason.trim(),
        ...(payment.upsellQuantity != null ? { upsellQuantity: payment.upsellQuantity } : {}),
      },
    },
  });

  /**
   * Audit (25 septembre 2026) — un refus de supplément envoyait le même
   * email que le refus du paiement initial, sans rien qui permette au
   * gestionnaire de savoir lequel des deux était concerné (son abonnement,
   * lui, reste actif). Le motif précise désormais qu'il s'agit du
   * supplément ; une seule clé de registre partagée (`company-payment-rejected`,
   * voir lib/email-templates/company-billing.ts — consolidation volontaire
   * de l'audit du 25 septembre 2026).
   */
  const isUpsell = payment.upsellQuantity != null;
  const companyName = payment.companySubscription.company.name;
  const companyAdmin = payment.companySubscription.company.companyAdmin;
  if (companyAdmin) {
    try {
      const email = await resolveEmail("company-payment-rejected", {
        adminName: companyAdmin.name,
        companyName,
        reason: isUpsell
          ? `Achat de ${payment.upsellQuantity} place(s) supplémentaire(s) — votre abonnement reste actif. Motif : ${reason.trim()}`
          : reason.trim(),
      });
      if (email) await sendTransactionalEmail({ to: companyAdmin.email, ...email });
    } catch (err) {
      // Même rationale que confirmCompanyPayment ci-dessus.
      console.error("[rejectCompanyPayment] failed to send rejection email", err);
    }
  }

  revalidatePath("/admin/entreprises");
  revalidatePath(`/admin/entreprises/${payment.companySubscription.companyId}`);
  revalidatePath(`/entreprises/${payment.companySubscription.companyId}`);
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

  const [newAdmin, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: newAdminUserId } }),
    prisma.company.findUnique({ where: { id: companyId }, include: { companyAdmin: true } }),
  ]);
  if (!newAdmin || newAdmin.companyId !== companyId) {
    return { success: false, error: "Ce membre ne fait pas partie de cette entreprise." };
  }
  if (!company) return { success: false, error: "Entreprise introuvable." };

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

  /**
   * 22 septembre 2026 (audit des emails transactionnels) — ni l'ancien ni le
   * nouvel admin n'étaient notifiés d'un changement de droits pourtant
   * significatif (gestion des paiements/invitations de l'entreprise).
   */
  try {
    const email = await resolveEmail("company-admin-reassigned-new-admin", {
      memberName: newAdmin.name,
      companyName: company.name,
    });
    if (email) await sendTransactionalEmail({ to: newAdmin.email, ...email });
  } catch (err) {
    console.error("[reassignCompanyAdmin] failed to send email to new admin", err);
  }
  if (company.companyAdmin && company.companyAdmin.id !== newAdminUserId) {
    try {
      const email = await resolveEmail("company-admin-reassigned-old-admin", {
        memberName: company.companyAdmin.name,
        companyName: company.name,
      });
      if (email) await sendTransactionalEmail({ to: company.companyAdmin.email, ...email });
    } catch (err) {
      console.error("[reassignCompanyAdmin] failed to send email to previous admin", err);
    }
  }

  revalidatePath(`/admin/entreprises/${companyId}`);
  revalidatePath(`/entreprises/${companyId}`);
  return { success: true, data: undefined };
}

/**
 * Intégration Evolia (8 oct. 2026) — renvoie un envoi journalisé, tel quel,
 * après un échec (Evolia indisponible, secret pas encore configuré…).
 */
export async function resendEvoliaPush(pushId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("entreprises");

  const push = await prisma.evoliaPush.findUnique({ where: { id: pushId } });
  if (!push) return { success: false, error: "Envoi introuvable." };
  // Écarté à l'activation (paiement annulé, liste remplacée) : le renvoyer
  // transmettrait une information périmée. Retenu : part avec la transmission
  // des envois retenus (Paramètres › Intégrations), pas un par un.
  if (push.status === "SKIPPED" || push.status === "HELD") {
    return {
      success: false,
      error:
        push.status === "SKIPPED"
          ? "Cet envoi a été écarté (paiement annulé ou liste remplacée) : il ne doit pas être renvoyé."
          : "Cet envoi est retenu : il part avec la transmission des envois retenus (Paramètres › Intégrations).",
    };
  }
  // 23 oct. 2026 — rien ne part avant l'activation d'Evolia (Paramètres › Intégrations).
  if (!(await isEvoliaLive())) {
    return {
      success: false,
      error: "Evolia n'est pas encore activé : cet envoi partira automatiquement à l'activation.",
    };
  }

  // Un paiement annulé ou refusé ne doit pas redevenir encaissable chez Evolia :
  // sa confirmation serait ensuite refusée par notre webhook.
  if (push.event === "company.registration.pushed" && push.reference) {
    const payment = await prisma.companyPayment.findUnique({
      where: { id: push.reference },
      select: { status: true },
    });
    if (payment?.status === "REJECTED") {
      return {
        success: false,
        error: "Ce paiement a été annulé ou refusé : il ne peut plus être envoyé à Evolia.",
      };
    }
  }

  // Une liste de participants est recalculée au moment du renvoi : renvoyer
  // l'ancien instantané pourrait écraser chez Evolia une liste plus récente.
  let delivered: boolean;
  if (push.event === "company.participants.confirmed") {
    await prisma.evoliaPush.updateMany({
      where: { id: pushId, status: { in: ["FAILED", "PENDING"] } },
      data: { status: "SKIPPED", lastError: "Remplacé par la liste à jour, renvoyée par l'admin." },
    });
    delivered = await pushParticipantsToEvolia(push.companyId);
  } else {
    delivered = await deliverEvoliaPush(pushId);
  }
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "evolia_push.resend",
      targetType: "EvoliaPush",
      targetId: pushId,
      metadata: { delivered },
    },
  });
  revalidatePath(`/admin/entreprises/${push.companyId}`);
  if (!delivered) {
    const updated = await prisma.evoliaPush.findUnique({ where: { id: pushId } });
    return {
      success: false,
      error: `Evolia n'a pas accepté l'envoi : ${updated?.lastError ?? "erreur inconnue"}`,
    };
  }
  return { success: true, data: undefined };
}
