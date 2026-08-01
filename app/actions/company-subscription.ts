"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { submitPaymentProofSchema } from "@/lib/validations/company-payment";
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
  if (!plan || !plan.isActive || plan.scope !== "COMPANY") {
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
    include: { company: true },
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

  await prisma.$transaction([
    prisma.companyPayment.create({
      data: {
        companySubscriptionId,
        amount: f.amount,
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
    await sendTransactionalEmail({
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Paiement entreprise à valider — ${subscription.company.name}`,
      react: AdminCompanyPaymentAlertEmail({
        companyName: subscription.company.name,
        amount: f.amount,
        method: f.method,
      }),
    });
  }

  revalidatePath(`/entreprises/${subscription.companyId}`);
  revalidatePath("/entreprise/paiement");
  return { success: true, data: undefined };
}
