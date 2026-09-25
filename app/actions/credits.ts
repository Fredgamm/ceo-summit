"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EventPaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { requireViewer } from "@/lib/require-viewer";
import { sendTransactionalEmail } from "@/lib/resend";
import { getViewerRankFromCompany, LEGACY_TIER_RANK } from "@/lib/plan-access";
import { confirmCreditPurchaseCore } from "@/lib/payment-confirmations";
import { resolveEmail } from "@/lib/email-template-resolver";
import { formatAriary } from "@/lib/utils";

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
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const parsed = requestCreditPurchaseSchema.safeParse({ credits, paymentMethod });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Requête invalide." };
  }

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
    try {
      const email = await resolveEmail("admin-credit-purchase-alert", {
        memberName: viewer.name,
        credits: pack.credits,
        amount: formatAriary(pack.priceAr),
      });
      if (email) await sendTransactionalEmail({ to: process.env.ADMIN_ALERT_EMAIL, ...email });
    } catch (err) {
      // L'achat est déjà enregistré à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer la demande (même bug de
      // classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[requestCreditPurchase] failed to send admin alert email", err);
    }
  }

  revalidatePath("/credits/acheter");
  return { success: true, data: undefined };
}

/**
 * requireAdmin puis délègue à `confirmCreditPurchaseCore`
 * (lib/payment-confirmations.ts), partagée avec le webhook paiement
 * générique (7 août 2026).
 */
export async function confirmCreditPurchase(purchaseId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("credits");
  const result = await confirmCreditPurchaseCore(purchaseId, adminId);
  if (result.success) revalidatePath("/admin/credits");
  return result;
}

export async function rejectCreditPurchase(purchaseId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("credits");

  const purchase = await prisma.creditPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { success: false, error: "Achat introuvable." };
  if (purchase.status !== "PENDING")
    return { success: false, error: "Cet achat a déjà été traité." };

  const { count } = await prisma.creditPurchase.updateMany({
    where: { id: purchaseId, status: "PENDING" },
    data: { status: "REJECTED", confirmedById: adminId, confirmedAt: new Date() },
  });
  if (count === 0) {
    return { success: false, error: "Cet achat a déjà été traité." };
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "credit_purchase.reject",
      targetType: "CreditPurchase",
      targetId: purchaseId,
    },
  });

  revalidatePath("/admin/credits");
  return { success: true, data: undefined };
}
