"use server";

import { revalidatePath } from "next/cache";
import { Tier } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { generateSecureToken, ACTIVATION_TOKEN_TTL_MS } from "@/lib/tokens";
import { sendTransactionalEmail } from "@/lib/resend";
import { tierLabel } from "@/lib/utils";
import ActivationEmail from "@/emails/activation-email";
import ApplicationRefusedEmail from "@/emails/application-refused-email";
import ApplicationMoreInfoEmail from "@/emails/application-more-info-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

// Correctif (refactor dette technique, sept. 2026) — audit du 7 août, §3
// "candidatures.ts sans aucune validation Zod", 8e fichier de la même
// catégorie que les 7 déjà corrigés au sprint du 5 août (EX-T01).
const tierSchema = z.nativeEnum(Tier);
const internalReasonSchema = z.string().trim().max(2000).optional().default("");
const messageSchema = z.string().trim().min(1, "Le message ne peut pas être vide.").max(2000);
const noteSchema = z.string().trim().max(5000);

/**
 * E8-T03 — gestion candidatures.
 * Ref: conception/01_onboarding_acces.md UC-04 + RG-01/RG-03/RG-07.
 *
 * Approving a candidature is a "sélection directe" (UC-03): it creates the
 * account and sends an activation email exactly like the Evolia webhook
 * does for a paid signup (E1-T02) — but no Membership/payment record is
 * created here, since the candidate hasn't paid yet. They still complete
 * payment via Evolia afterwards; approval only grants account access.
 */
export async function approveApplication(applicationId: string, tier: Tier): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("candidatures");

  const parsedTier = tierSchema.safeParse(tier);
  if (!parsedTier.success) return { success: false, error: "Tier invalide." };
  tier = parsedTier.data;

  const application = await prisma.membershipApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) return { success: false, error: "Candidature introuvable." };
  if (application.status !== "PENDING") {
    return { success: false, error: "Cette candidature a déjà été traitée." };
  }

  const email = application.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { success: false, error: "Un compte existe déjà pour cet email." };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: application.fullName,
      title: application.title,
      country: application.country,
      sectors: [application.sector],
      role: tier,
      status: "PENDING_ACTIVATION",
    },
  });

  const token = generateSecureToken();
  await prisma.activationToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS) },
  });

  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: { status: "APPROVED", decidedById: adminId, decidedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "candidature.approve",
      targetType: "MembershipApplication",
      targetId: applicationId,
      metadata: { tier },
    },
  });

  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: "Votre accès CEO Summit est prêt — activez votre compte",
      react: ActivationEmail({
        memberName: user.name,
        tier: tierLabel(tier),
        activationUrl: `${process.env.NEXTAUTH_URL}/activer/${token}`,
      }),
    });
  } catch (err) {
    // Le compte et le token existent déjà en base à ce stade — un échec
    // d'envoi ne doit pas faire échouer l'approbation (même bug de classe
    // que celui corrigé sur signup() le 1er août 2026 ; audit du 7 août,
    // "pattern try/catch email admin appliqué de façon inégale").
    console.error("[approveApplication] failed to send activation email", err);
  }

  revalidatePath("/admin/candidatures");
  return { success: true, data: undefined };
}

export async function refuseApplication(
  applicationId: string,
  internalReason: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("candidatures");

  const parsedReason = internalReasonSchema.safeParse(internalReason);
  if (!parsedReason.success) return { success: false, error: "Motif invalide." };
  internalReason = parsedReason.data;

  const application = await prisma.membershipApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) return { success: false, error: "Candidature introuvable." };
  if (application.status !== "PENDING") {
    return { success: false, error: "Cette candidature a déjà été traitée." };
  }

  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: {
      status: "REFUSED",
      decidedById: adminId,
      decidedAt: new Date(),
      adminNote: internalReason || application.adminNote,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "candidature.refuse",
      targetType: "MembershipApplication",
      targetId: applicationId,
    },
  });

  // RG-07 — the internal reason is never included in this email.
  try {
    await sendTransactionalEmail({
      to: application.email,
      subject: "Votre candidature au CEO Summit",
      react: ApplicationRefusedEmail({ candidateName: application.fullName }),
    });
  } catch (err) {
    console.error("[refuseApplication] failed to send decline email", err);
  }

  revalidatePath("/admin/candidatures");
  return { success: true, data: undefined };
}

export async function requestMoreInfo(
  applicationId: string,
  message: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("candidatures");

  const parsedMessage = messageSchema.safeParse(message);
  if (!parsedMessage.success) {
    return { success: false, error: parsedMessage.error.issues[0]?.message ?? "Message invalide." };
  }
  message = parsedMessage.data;

  const application = await prisma.membershipApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) return { success: false, error: "Candidature introuvable." };
  // Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
  // "requestMoreInfo sans garde de statut, contrairement à
  // approve/refuseApplication" : une soumission en double pouvait
  // envoyer une demande d'infos à un candidat déjà décidé.
  if (application.status !== "PENDING") {
    return { success: false, error: "Cette candidature a déjà été traitée." };
  }

  const noteEntry = `[${new Date().toISOString()}] Info demandée : ${message}`;
  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: {
      adminNote: application.adminNote ? `${application.adminNote}\n${noteEntry}` : noteEntry,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "candidature.request_info",
      targetType: "MembershipApplication",
      targetId: applicationId,
    },
  });

  try {
    await sendTransactionalEmail({
      to: application.email,
      subject: "Complément d'information — votre candidature CEO Summit",
      react: ApplicationMoreInfoEmail({ candidateName: application.fullName, message }),
    });
  } catch (err) {
    console.error("[requestMoreInfo] failed to send info-request email", err);
  }

  revalidatePath(`/admin/candidatures/${applicationId}`);
  return { success: true, data: undefined };
}

export async function saveApplicationNote(
  applicationId: string,
  note: string
): Promise<ActionResult> {
  await requireAdmin("candidatures");

  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) return { success: false, error: "Note invalide." };

  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: { adminNote: parsed.data },
  });

  revalidatePath(`/admin/candidatures/${applicationId}`);
  return { success: true, data: undefined };
}
