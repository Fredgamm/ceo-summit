"use server";

import { prisma } from "@/lib/prisma";
import { applicationSchema, type ApplicationInput } from "@/lib/validations/application";
import { sendTransactionalEmail } from "@/lib/resend";
import ApplicationReceivedEmail from "@/emails/application-received-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * B1 (audit du 29 juillet 2026) — seul point d'entrée public pour candidater.
 * Avant ce correctif, /demande-acces (référencé depuis login-form.tsx et
 * whitelisté dans middleware.ts) n'existait pas : le funnel d'acquisition
 * était totalement cassé.
 *
 * `consentedAt` horodate le consentement RGPD (case CGU/politique de
 * confidentialité cochée) — preuve de collecte, pas juste un booléen.
 */
export async function submitApplication(input: ApplicationInput): Promise<ActionResult> {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const email = parsed.data.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return {
      success: false,
      error: "Un compte existe déjà pour cet email. Connectez-vous plutôt.",
    };
  }

  const existingApplication = await prisma.membershipApplication.findFirst({
    where: { email, status: "PENDING" },
  });
  if (existingApplication) {
    return {
      success: false,
      error: "Une candidature est déjà en cours d'examen pour cet email.",
    };
  }

  await prisma.membershipApplication.create({
    data: {
      fullName: parsed.data.fullName,
      email,
      companyName: parsed.data.companyName,
      title: parsed.data.title,
      sector: parsed.data.sector,
      country: parsed.data.country,
      requestedTier: parsed.data.requestedTier,
      sponsorName: parsed.data.sponsorName || null,
      motivation: parsed.data.motivation,
      consentedAt: new Date(),
    },
  });

  await sendTransactionalEmail({
    to: email,
    subject: "Votre candidature au CEO Summit a bien été reçue",
    react: ApplicationReceivedEmail({ candidateName: parsed.data.fullName }),
  });

  return { success: true, data: undefined };
}
