import type { PaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { sendSms } from "@/lib/sms";
import { formatDateFr } from "@/lib/utils";
import { resolveEmail } from "@/lib/email-template-resolver";
import { CANCELLED_BY_COMPANY_REASON, isEvoliaPaymentMethod } from "@/lib/payment-methods";
import { pushParticipantsToEvolia, pushRegistrationToEvolia } from "@/lib/evolia";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Logique de confirmation partagée entre l'action admin (clic manuel,
 * `requireAdmin` déjà vérifié par l'appelant) et le webhook paiement
 * générique (7 août 2026, `app/api/webhooks/payments/route.ts`) — un
 * prestataire externe peut confirmer automatiquement, en plus du clic
 * admin qui reste toujours disponible (les deux coexistent, aucun ne
 * remplace l'autre).
 *
 * `actorId: null` = confirmé par le webhook, pas par un humain — les deux
 * champs `reviewedById`/`confirmedById` (déjà nullables) restent `null`
 * dans ce cas, et aucune entrée `AuditLog` n'est écrite (`AuditLog.actorId`
 * n'est pas nullable, et n'a pas vocation à tracer les évènements
 * automatiques — c'est le rôle de `WebhookLog`, qui capture déjà le
 * payload complet de chaque appel webhook).
 *
 * IMPORTANT : ces fonctions ne sont volontairement PAS exportées depuis un
 * fichier `"use server"` — les rendre appelables directement par un client
 * contournerait `requireAdmin()`. Seuls les fichiers d'actions (qui
 * vérifient l'admin avant d'appeler) et la route webhook (qui vérifie la
 * signature HMAC avant d'appeler) doivent importer ce module.
 */

export async function confirmCompanyPaymentCore(
  companyPaymentId: string,
  actorId: string | null
): Promise<ActionResult<{ companyId: string }>> {
  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    include: {
      companySubscription: {
        include: {
          plan: true,
          company: {
            include: {
              companyAdmin: true,
              users: {
                select: { id: true, status: true, createdAt: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
      upsellPlan: true,
    },
  });
  if (!payment) return { success: false, error: "Paiement introuvable." };

  const now = new Date();

  /**
   * 22 septembre 2026 (`conception/12` §3.2) — un paiement de supplément
   * (`upsellQuantity` non nul) n'active rien : l'abonnement est déjà actif.
   * Confirmer un tel paiement se limite à incrémenter `extraSeats` — pas de
   * transition de statut, pas de ré-inscription à l'évènement, pas de
   * recalcul des crédits (retirés du produit, voir `conception/09`).
   */
  if (payment.upsellQuantity != null) {
    const upsellQuantity = payment.upsellQuantity;
    // Audit (25 septembre 2026) — confirmation et incrément dans une même
    // transaction : un échec entre les deux laissait un paiement CONFIRMED
    // sans les places payées (et non rejouable, `status` n'étant plus PENDING).
    const confirmed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.companyPayment.updateMany({
        where: { id: companyPaymentId, status: "PENDING" },
        data: { status: "CONFIRMED", reviewedById: actorId, reviewedAt: now },
      });
      if (count === 0) return false;
      await tx.companySubscription.update({
        where: { id: payment.companySubscriptionId },
        data: { extraSeats: { increment: upsellQuantity } },
      });
      return true;
    });
    if (!confirmed) {
      return { success: false, error: "Ce paiement a déjà été traité." };
    }
    if (actorId) {
      await prisma.auditLog.create({
        data: {
          actorId,
          action: "company_payment.confirm_upsell",
          targetType: "CompanyPayment",
          targetId: companyPaymentId,
          metadata: { extraSeats: payment.upsellQuantity },
        },
      });
    }

    const upsellCompanyAdmin = payment.companySubscription.company.companyAdmin;
    if (upsellCompanyAdmin && payment.upsellPlan) {
      try {
        const email = await resolveEmail("company-upsell-confirmed", {
          adminName: upsellCompanyAdmin.name,
          companyName: payment.companySubscription.company.name,
          planName: payment.upsellPlan.name,
          quantity: payment.upsellQuantity,
        });
        if (email) await sendTransactionalEmail({ to: upsellCompanyAdmin.email, ...email });
      } catch (err) {
        console.error("[confirmCompanyPaymentCore] failed to send upsell confirmation email", err);
      }
    }

    await notifyEvolia(payment, true);
    return { success: true, data: { companyId: payment.companySubscription.companyId } };
  }

  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  // Même transaction que pour un supplément : un échec entre les deux écritures
  // laissait un paiement CONFIRMED (donc non rejouable) avec un abonnement
  // resté en PENDING_REVIEW, c'est-à-dire une entreprise payée sans accès.
  const confirmed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.companyPayment.updateMany({
      where: { id: companyPaymentId, status: "PENDING" },
      data: { status: "CONFIRMED", reviewedById: actorId, reviewedAt: now },
    });
    if (count === 0) return false;
    await tx.companySubscription.update({
      where: { id: payment.companySubscriptionId },
      data: { status: "ACTIVE", startDate: now, endDate: oneYearLater },
    });
    return true;
  });
  if (!confirmed) {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }

  // Module 18 §4.9 (8 oct. 2026) — le paiement donne l'accès à la plateforme,
  // pas l'inscription à l'événement : c'est la liste des participants validée
  // par le gérant qui inscrit (app/actions/company-participants.ts).

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "company_payment.confirm",
        targetType: "CompanyPayment",
        targetId: companyPaymentId,
      },
    });
  }

  const companyAdmin = payment.companySubscription.company.companyAdmin;
  if (companyAdmin) {
    try {
      const email = await resolveEmail("company-payment-confirmed", {
        adminName: companyAdmin.name,
        companyName: payment.companySubscription.company.name,
      });
      if (email) await sendTransactionalEmail({ to: companyAdmin.email, ...email });
    } catch (err) {
      // Le paiement est déjà confirmé et l'abonnement déjà actif à ce
      // stade — un échec d'envoi ne doit pas faire échouer l'action.
      console.error("[confirmCompanyPaymentCore] failed to send confirmation email", err);
    }

    if (companyAdmin.phone) {
      try {
        await sendSms(
          companyAdmin.phone,
          `CEO Summit — le paiement de ${payment.companySubscription.company.name} est confirmé. Accès activé.`
        );
      } catch (err) {
        console.error("[confirmCompanyPaymentCore] failed to send confirmation SMS", err);
      }
    }
  }

  await notifyEvolia(payment, false);
  return { success: true, data: { companyId: payment.companySubscription.companyId } };
}

/**
 * Intégration Evolia (conception/11 §3) — après confirmation d'un paiement :
 * - virement ou chèque : Evolia n'a rien encaissé, l'inscription lui est
 *   transmise pour information à ce moment-là (une carte ou un Mobile Money
 *   l'a déjà été au lancement du paiement, `startEvoliaPayment`) ;
 * - supplément : si le gérant a déjà validé sa liste, elle est renvoyée avec
 *   la nouvelle capacité totale.
 * Les échecs sont journalisés (`EvoliaPush`) sans faire échouer la confirmation.
 */
async function notifyEvolia(
  payment: {
    id: string;
    method: PaymentMethod;
    companySubscription: { companyId: string; participantsValidatedAt: Date | null };
  },
  isUpsell: boolean
) {
  if (!isEvoliaPaymentMethod(payment.method)) await pushRegistrationToEvolia(payment.id);
  if (isUpsell && payment.companySubscription.participantsValidatedAt) {
    await pushParticipantsToEvolia(payment.companySubscription.companyId);
  }
}

export async function confirmEventRegistrationPaymentCore(
  registrationId: string,
  actorId: string | null
): Promise<ActionResult> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { user: true, event: true },
  });
  if (!registration) return { success: false, error: "Inscription introuvable." };

  const { count } = await prisma.eventRegistration.updateMany({
    where: { id: registrationId, paymentStatus: "PENDING" },
    data: { status: "CONFIRMED", paymentStatus: "PAID" },
  });
  if (count === 0) {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "event_registration.confirm_payment",
        targetType: "EventRegistration",
        targetId: registrationId,
      },
    });
  }

  try {
    const email = await resolveEmail("event-registration", {
      memberName: registration.user.name,
      eventTitle: registration.event.title,
      eventDateLabel: formatDateFr(registration.event.date),
      eventLocation: registration.event.isOnline ? "En ligne" : registration.event.location,
    });
    if (email) await sendTransactionalEmail({ to: registration.user.email, ...email });
  } catch (err) {
    console.error("[confirmEventRegistrationPaymentCore] failed to send confirmation email", err);
  }

  return { success: true, data: undefined };
}

/**
 * Evolia confirme un paiement que le gérant avait annulé pour changer de mode
 * de paiement : il a bien payé, on ne doit pas le priver de son accès.
 * - `revived` : le paiement redevient en attente, la confirmation normale suit ;
 * - `already-paid` : l'offre avait entre-temps été réglée autrement (virement
 *   validé) — le paiement est enregistré comme confirmé sans toucher à
 *   l'abonnement, et signalé pour remboursement (double paiement) ;
 * - `none` : paiement non concerné.
 */
export async function reviveCancelledEvoliaPayment(
  companyPaymentId: string
): Promise<"none" | "revived" | "already-paid"> {
  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    select: {
      status: true,
      rejectionReason: true,
      upsellQuantity: true,
      createdAt: true,
      companySubscriptionId: true,
    },
  });
  if (
    !payment ||
    payment.status !== "REJECTED" ||
    payment.rejectionReason !== CANCELLED_BY_COMPANY_REASON
  ) {
    return "none";
  }

  if (payment.upsellQuantity == null) {
    const paidOtherwise = await prisma.companyPayment.findFirst({
      where: {
        companySubscriptionId: payment.companySubscriptionId,
        status: "CONFIRMED",
        upsellQuantity: null,
        createdAt: { gt: payment.createdAt },
      },
      select: { id: true },
    });
    if (paidOtherwise) {
      await prisma.companyPayment.updateMany({
        where: { id: companyPaymentId, status: "REJECTED" },
        data: {
          status: "CONFIRMED",
          reviewedAt: new Date(),
          rejectionReason: `Confirmé par Evolia après annulation, alors que l'offre était déjà réglée (paiement ${paidOtherwise.id}) — double paiement à rembourser.`,
        },
      });
      return "already-paid";
    }
  }

  await prisma.companyPayment.updateMany({
    where: { id: companyPaymentId, status: "REJECTED" },
    data: { status: "PENDING", reviewedAt: null, rejectionReason: null },
  });
  return "revived";
}
