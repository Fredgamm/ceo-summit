"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { appUrl } from "@/lib/app-url";
import { mapWithConcurrency } from "@/lib/concurrency";
import { resolveEmail } from "@/lib/email-template-resolver";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  PREREGISTERED_SUBSCRIPTION_WHERE,
  PREREGISTRATION_SETTING_KEYS,
  getPreregistrationStatus,
} from "@/lib/preregistration";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SMTP_CONCURRENCY = 5;

/**
 * 23 oct. 2026 — jour d'ouverture des paiements (fin de la préinscription).
 * Vide = pas de préinscription : le paiement est ouvert, comme avant.
 */
export async function updatePaymentsOpenDay(day: string): Promise<ActionResult> {
  const { userId } = await requireAdmin("parametres");
  const value = day.trim();
  if (value && !DAY_RE.test(value)) return { success: false, error: "Date invalide." };

  const key = PREREGISTRATION_SETTING_KEYS.paymentsOpenOn;
  await prisma.$transaction([
    value
      ? prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
      : prisma.platformSetting.deleteMany({ where: { key } }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "settings.preregistration.update",
        targetType: "PlatformSetting",
        targetId: key,
        metadata: { paymentsOpenOn: value || null },
      },
    }),
  ]);

  revalidatePath("/admin/parametres");
  revalidatePath("/entreprise/paiement");
  return { success: true, data: undefined };
}

/**
 * E-mail « les inscriptions sont ouvertes » à chaque gestionnaire préinscrit
 * (offre choisie, rien de payé). Seulement une fois les paiements ouverts ;
 * renvoyable (l'admin confirme), la date du dernier envoi est affichée.
 */
export async function sendPaymentsOpenEmail(): Promise<
  ActionResult<{ sent: number; failed: number }>
> {
  const { userId } = await requireAdmin("parametres");
  const status = await getPreregistrationStatus();
  if (status.active) {
    return {
      success: false,
      error: "Les paiements ne sont pas encore ouverts : l'e-mail partira à la date d'ouverture.",
    };
  }

  const subscriptions = await prisma.companySubscription.findMany({
    where: PREREGISTERED_SUBSCRIPTION_WHERE,
    include: {
      plan: { select: { name: true } },
      company: {
        select: {
          name: true,
          companyAdmin: { select: { name: true, email: true, status: true } },
        },
      },
    },
  });
  const recipients = subscriptions.filter((s) => s.company.companyAdmin?.status === "ACTIVE");
  if (recipients.length === 0) {
    return { success: false, error: "Aucune entreprise préinscrite à prévenir." };
  }

  const paymentUrl = `${appUrl()}/entreprise/paiement`;
  const results = await mapWithConcurrency(recipients, SMTP_CONCURRENCY, async (s) => {
    const admin = s.company.companyAdmin!;
    try {
      const email = await resolveEmail("preregistration-payments-open", {
        adminName: admin.name,
        companyName: s.company.name,
        planName: s.plan.name.replace(/\*+/g, "").trim(),
        paymentUrl,
      });
      // Modèle désactivé dans Admin › E-mails : rien n'est envoyé, sans erreur.
      if (!email) return true;
      await sendTransactionalEmail({ to: admin.email, ...email });
      return true;
    } catch (err) {
      console.error("[preregistration] payments-open email failed", admin.email, err);
      return false;
    }
  });
  const sent = results.filter(Boolean).length;
  const failed = results.length - sent;

  const key = PREREGISTRATION_SETTING_KEYS.openEmailSentAt;
  const value = new Date().toISOString();
  await prisma.$transaction([
    prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "preregistration.payments_open_email",
        targetType: "PlatformSetting",
        targetId: key,
        metadata: { sent, failed },
      },
    }),
  ]);

  revalidatePath("/admin/parametres");
  return { success: true, data: { sent, failed } };
}
