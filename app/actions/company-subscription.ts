"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { submitPaymentProofSchema } from "@/lib/validations/company-payment";
import { computeDueAmount, meetsMinParticipants } from "@/lib/company-payment-amount";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import AdminCompanyPaymentAlertEmail from "@/emails/admin-company-payment-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — choix d'une offre par l'admin
 * entreprise.
 *
 * RG-11 (4 août 2026) — changer d'offre reste possible à tout moment tant
 * que l'abonnement n'est pas `ACTIVE`, y compris après soumission d'une
 * preuve (`PENDING_REVIEW`) : dans ce cas, la preuve précédente est
 * invalidée (marquée `REJECTED`, motif automatique) et le dossier repasse
 * en `PENDING_PAYMENT` — l'entreprise doit soumettre une nouvelle preuve
 * pour la nouvelle offre, `declaredParticipants` est réinitialisé.
 */
export async function selectPlan(companyId: string, planId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { subscription: { include: { plan: { include: { event: true } } } } },
  });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== session.user.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut choisir une offre." };
  }

  const effectiveStatus = company.subscription
    ? computeEffectiveStatus(company.subscription.status, company.subscription.plan.event?.date)
    : null;
  // RG-12 — une souscription ACTIVE dont l'évènement est passé n'est plus
  // qu'un statut affiché : on la persiste en EXPIRED avant de continuer,
  // pour que ce constat ne dépende pas d'un autre point de lecture.
  if (effectiveStatus === "EXPIRED" && company.subscription!.status === "ACTIVE") {
    await prisma.companySubscription.update({
      where: { id: company.subscription!.id },
      data: { status: "EXPIRED" },
    });
  }
  if (effectiveStatus === "ACTIVE") {
    return {
      success: false,
      error: "Un abonnement actif existe déjà — contactez l'équipe CEO Summit pour en changer.",
    };
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    return { success: false, error: "Offre invalide." };
  }

  if (company.subscription?.status === "PENDING_REVIEW") {
    await prisma.companyPayment.updateMany({
      where: { companySubscriptionId: company.subscription.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectionReason: "Offre changée avant validation — nouvelle preuve requise.",
        reviewedAt: new Date(),
      },
    });
  }

  await prisma.companySubscription.upsert({
    where: { companyId },
    update: { planId, status: "PENDING_PAYMENT", declaredParticipants: null },
    create: { companyId, planId, status: "PENDING_PAYMENT" },
  });

  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/entreprise/paiement");
  return { success: true, data: undefined };
}

/** Upload de la preuve + soumission pour revue admin. */
export async function submitPaymentProof(
  companySubscriptionId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const subscription = await prisma.companySubscription.findUnique({
    where: { id: companySubscriptionId },
    include: { company: true, plan: true },
  });
  if (!subscription) return { success: false, error: "Abonnement introuvable." };
  if (subscription.company.companyAdminId !== session.user.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut soumettre un paiement." };
  }
  if (subscription.status !== "PENDING_PAYMENT") {
    return {
      success: false,
      error: "Cet abonnement n'est pas en attente de paiement.",
    };
  }

  const parsed = submitPaymentProofSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  /**
   * RG-04/RG-06 (4 août 2026) — pour une offre `PER_PARTICIPANT`, le
   * montant est calculé à partir du nombre de participants **déclaré** par
   * l'entreprise (source de vérité), pas du headcount réel — remplace le
   * blocage historique par seuil réel (Phase 2ter). Pour `FIXED_BUNDLE`,
   * pas de déclaration nécessaire, le montant est le forfait fixe. Le
   * nombre déclaré est persisté sur l'abonnement (verrouillé dès cette
   * soumission — RG-06 : le modifier exige de changer d'offre, RG-11).
   */
  const isFixedBundle = subscription.plan.pricingMode === "FIXED_BUNDLE";
  if (!isFixedBundle && !f.declaredParticipants) {
    return { success: false, error: "Le nombre de participants prévu est requis." };
  }
  const declaredParticipants = isFixedBundle ? 1 : f.declaredParticipants!;

  if (!meetsMinParticipants(subscription.plan, declaredParticipants)) {
    const missing = (subscription.plan.minParticipants ?? 1) - declaredParticipants;
    return {
      success: false,
      error: `Il manque encore ${missing} participant(s) déclaré(s) pour atteindre le seuil minimum de cette offre (${subscription.plan.minParticipants}).`,
    };
  }
  const amount = computeDueAmount(subscription.plan, declaredParticipants);

  await prisma.$transaction([
    prisma.companyPayment.create({
      data: {
        companySubscriptionId,
        amount,
        method: f.method,
        proofFileKey: f.proofFileKey,
        comment: f.comment || null,
        submittedById: session.user.id,
      },
    }),
    prisma.companySubscription.update({
      where: { id: companySubscriptionId },
      data: {
        status: "PENDING_REVIEW",
        declaredParticipants: isFixedBundle ? null : declaredParticipants,
      },
    }),
  ]);

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Paiement entreprise à valider — ${subscription.company.name}`,
        react: AdminCompanyPaymentAlertEmail({
          companyName: subscription.company.name,
          amount,
          method: f.method,
        }),
      });
    } catch (err) {
      // Le paiement est déjà enregistré à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer l'action (même bug de
      // classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[submitPaymentProof] failed to send admin alert email", err);
    }
  }

  revalidatePath(`/entreprises/${subscription.companyId}`);
  revalidatePath("/entreprise/paiement");
  return { success: true, data: undefined };
}
