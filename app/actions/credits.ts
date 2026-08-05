"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EventPaymentMethod } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import { getViewerRankFromCompany, LEGACY_TIER_RANK, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import CreditPurchaseConfirmedEmail from "@/emails/credit-purchase-confirmed-email";
import AdminCreditPurchaseAlertEmail from "@/emails/admin-credit-purchase-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const requestCreditPurchaseSchema = z.object({
  credits: z.coerce.number().int().positive(),
  paymentMethod: z.enum(["VIREMENT", "MOBILE_MONEY"]),
});

/** E6-T05 — achat de packs de crédits : demande → alerte admin → validation manuelle → crédits crédités. */
export async function requestCreditPurchase(
  credits: number,
  paymentMethod: EventPaymentMethod
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const parsed = requestCreditPurchaseSchema.safeParse({ credits, paymentMethod });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Requête invalide." };
  }

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) return { success: false, error: "Non authentifié." };

  // Sprint de correction (5 août 2026, EX-T01) — l'achat de crédits Deal
  // Room est censé être réservé aux membres Executive et Chairman (chaque
  // crédit sert à contacter un porteur d'opportunité, un avantage
  // Executive+) : aucune vérification n'existait jusqu'ici, ni ici ni sur
  // /credits/acheter.
  if (getViewerRankFromCompany(viewer.company) < LEGACY_TIER_RANK.EXECUTIVE) {
    return {
      success: false,
      error: "L'achat de crédits est réservé aux membres Executive et Chairman.",
    };
  }

  const pack = await prisma.creditPackPrice.findUnique({
    where: { credits: parsed.data.credits },
  });
  if (!pack) return { success: false, error: "Pack de crédits invalide." };

  await prisma.creditPurchase.create({
    data: {
      userId: viewer.id,
      credits: pack.credits,
      priceAr: pack.priceAr,
      paymentMethod,
      status: "PENDING",
    },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    await sendTransactionalEmail({
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Achat de crédits à valider — ${viewer.name}`,
      react: AdminCreditPurchaseAlertEmail({
        memberName: viewer.name,
        credits: pack.credits,
        amount: pack.priceAr,
      }),
    });
  }

  revalidatePath("/credits/acheter");
  return { success: true, data: undefined };
}

export async function confirmCreditPurchase(purchaseId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("credits");

  const purchase = await prisma.creditPurchase.findUnique({
    where: { id: purchaseId },
    include: { user: true },
  });
  if (!purchase) return { success: false, error: "Achat introuvable." };
  if (purchase.status !== "PENDING")
    return { success: false, error: "Cet achat a déjà été traité." };

  await prisma.$transaction([
    prisma.creditPurchase.update({
      where: { id: purchaseId },
      data: { status: "CONFIRMED", confirmedById: adminId, confirmedAt: new Date() },
    }),
    prisma.creditBalance.upsert({
      where: { userId: purchase.userId },
      update: { purchased: { increment: purchase.credits } },
      create: { userId: purchase.userId, included: 0, purchased: purchase.credits, used: 0 },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: purchase.userId,
        amount: purchase.credits,
        type: "PURCHASE",
        reason: `Achat pack ${purchase.credits} crédits`,
      },
    }),
  ]);

  await sendTransactionalEmail({
    to: purchase.user.email,
    subject: "Votre achat de crédits CEO Summit est confirmé",
    react: CreditPurchaseConfirmedEmail({
      memberName: purchase.user.name,
      credits: purchase.credits,
    }),
  });

  revalidatePath("/admin/credits");
  return { success: true, data: undefined };
}

export async function rejectCreditPurchase(purchaseId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("credits");

  const purchase = await prisma.creditPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { success: false, error: "Achat introuvable." };
  if (purchase.status !== "PENDING")
    return { success: false, error: "Cet achat a déjà été traité." };

  await prisma.creditPurchase.update({
    where: { id: purchaseId },
    data: { status: "REJECTED", confirmedById: adminId, confirmedAt: new Date() },
  });

  revalidatePath("/admin/credits");
  return { success: true, data: undefined };
}
