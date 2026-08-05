"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { submitPaymentProofSchema } from "@/lib/validations/company-payment";
import { computeDueAmount, meetsMinParticipants } from "@/lib/company-payment-amount";
import AdminCompanyPaymentAlertEmail from "@/emails/admin-company-payment-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/** Phase 2 offres/paiement (30 juillet 2026) — choix d'une offre par l'admin entreprise. */
export async function selectPlan(companyId: string, planId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { subscription: true },
  });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== session.user.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut choisir une offre." };
  }
  if (company.subscription?.status === "ACTIVE") {
    return {
      success: false,
      error: "Un abonnement actif existe déjà — contactez l'équipe CEO Summit pour en changer.",
    };
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    return { success: false, error: "Offre invalide." };
  }

  await prisma.companySubscription.upsert({
    where: { companyId },
    update: { planId, status: "PENDING_PAYMENT" },
    create: { companyId, planId, status: "PENDING_PAYMENT" },
  });

  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/entreprise/abonnement");
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
   * Phase 2ter (1er août 2026) — tarification par participant : le montant
   * n'est plus saisi par l'utilisateur, calculé à partir du nombre réel de
   * collaborateurs rattachés (propriétaire inclus), pas des invitations
   * encore en attente. Bloque la soumission tant que le seuil minimum de
   * l'offre n'est pas atteint.
   */
  const headcount = await prisma.user.count({ where: { companyId: subscription.companyId } });
  if (!meetsMinParticipants(subscription.plan, headcount)) {
    const missing = (subscription.plan.minParticipants ?? 1) - headcount;
    return {
      success: false,
      error: `Il manque encore ${missing} collaborateur(s) pour atteindre le seuil minimum de cette offre (${subscription.plan.minParticipants}).`,
    };
  }
  const amount = computeDueAmount(subscription.plan, headcount);

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
      data: { status: "PENDING_REVIEW" },
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
