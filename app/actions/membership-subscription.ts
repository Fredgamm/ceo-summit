"use server";

import { revalidatePath } from "next/cache";
import type { Tier } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { submitPaymentProofSchema } from "@/lib/validations/company-payment";
import AdminMembershipPaymentAlertEmail from "@/emails/admin-membership-payment-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const LEGACY_TIERS: readonly Tier[] = ["MEMBER", "EXECUTIVE", "CHAIRMAN"];

/**
 * Phase 2ter (1er août 2026) — miroir individuel de
 * company-subscription.ts::selectPlan/submitPaymentProof, Evolia étant
 * définitivement écarté aussi pour les adhésions individuelles. `tier`
 * n'est renseigné que si le nom de l'offre correspond littéralement à
 * l'un des 3 tiers historiques (MEMBER/EXECUTIVE/CHAIRMAN) — une offre
 * librement créée par l'admin (ex. "Executive pass" à 2,5M Ar, sans
 * rapport avec l'ancien tier EXECUTIVE à 600k) reste `null`, lu uniquement
 * via `planId` par le code qui a déjà migré (voir Phase 0).
 */
export async function selectIndividualPlan(planId: string): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      memberships: {
        where: { status: { in: ["PENDING_PAYMENT", "PENDING_REVIEW", "ACTIVE"] } },
        take: 1,
      },
    },
  });
  if (!viewer) return { success: false, error: "Compte introuvable." };
  if (viewer.companyId) {
    return {
      success: false,
      error:
        "Votre compte est déjà rattaché à une entreprise — une adhésion individuelle n'est pas cumulable.",
    };
  }
  if (viewer.memberships.length > 0) {
    return { success: false, error: "Vous avez déjà une adhésion en cours ou active." };
  }

  const plan = await prisma.plan.findFirst({
    where: { id: planId, isActive: true, isSelfService: true, scope: "INDIVIDUAL" },
  });
  if (!plan) return { success: false, error: "Offre invalide." };

  const tier = (LEGACY_TIERS as readonly string[]).includes(plan.name) ? (plan.name as Tier) : null;

  const membership = await prisma.membership.create({
    data: {
      userId: viewer.id,
      planId: plan.id,
      tier,
      status: "PENDING_PAYMENT",
      price: plan.priceAr,
    },
  });

  revalidatePath("/paiement-en-attente");
  return { success: true, data: { id: membership.id } };
}

/** Upload de la preuve + soumission pour revue admin — miroir de company-subscription.ts::submitPaymentProof. */
export async function submitMembershipPaymentProof(
  membershipId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: true, plan: true },
  });
  if (!membership) return { success: false, error: "Adhésion introuvable." };
  if (membership.userId !== session.user.id) {
    return { success: false, error: "Cette adhésion ne vous appartient pas." };
  }
  if (membership.status !== "PENDING_PAYMENT") {
    return { success: false, error: "Cette adhésion n'est pas en attente de paiement." };
  }
  if (!membership.plan) return { success: false, error: "Offre introuvable pour cette adhésion." };

  const parsed = submitPaymentProofSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  const amount = membership.plan.priceAr; // 1 participant, pas de seuil pour une adhésion individuelle

  await prisma.$transaction([
    prisma.membershipPayment.create({
      data: {
        membershipId,
        amount,
        method: f.method,
        proofFileKey: f.proofFileKey,
        comment: f.comment || null,
        submittedById: session.user.id,
      },
    }),
    prisma.membership.update({ where: { id: membershipId }, data: { status: "PENDING_REVIEW" } }),
  ]);

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Adhésion à valider — ${membership.user.name}`,
        react: AdminMembershipPaymentAlertEmail({
          memberName: membership.user.name,
          amount,
          method: f.method,
        }),
      });
    } catch (err) {
      // L'adhésion est déjà enregistrée à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer l'action (même bug de
      // classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[submitMembershipPaymentProof] failed to send admin alert email", err);
    }
  }

  revalidatePath("/paiement-en-attente");
  revalidatePath("/adhesion/paiement");
  return { success: true, data: undefined };
}
