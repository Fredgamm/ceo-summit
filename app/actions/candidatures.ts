"use server";

import { revalidatePath } from "next/cache";
import type { Tier } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { generateSecureToken, ACTIVATION_TOKEN_TTL_MS } from "@/lib/tokens";
import { sendTransactionalEmail } from "@/lib/resend";
import { tierLabel } from "@/lib/utils";
import ActivationEmail from "@/emails/activation-email";
import ApplicationRefusedEmail from "@/emails/application-refused-email";
import ApplicationMoreInfoEmail from "@/emails/application-more-info-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

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
    // La candidature est déjà approuvée et le compte déjà créé à ce stade
    // — un échec d'envoi ne doit pas faire échouer l'action.
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
    console.error("[refuseApplication] failed to send refusal email", err);
  }

  revalidatePath("/admin/candidatures");
  return { success: true, data: undefined };
}

export async function requestMoreInfo(
  applicationId: string,
  message: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("candidatures");

  if (!message.trim()) {
    return { success: false, error: "Le message ne peut pas être vide." };
  }

  const application = await prisma.membershipApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) return { success: false, error: "Candidature introuvable." };

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
    console.error("[requestMoreInfo] failed to send email", err);
  }

  revalidatePath(`/admin/candidatures/${applicationId}`);
  return { success: true, data: undefined };
}

export async function saveApplicationNote(
  applicationId: string,
  note: string
): Promise<ActionResult> {
  await requireAdmin("candidatures");

  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: { adminNote: note },
  });

  revalidatePath(`/admin/candidatures/${applicationId}`);
  return { success: true, data: undefined };
}
