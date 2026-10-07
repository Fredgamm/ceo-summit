"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import { resolveEmail } from "@/lib/email-template-resolver";
import { generateSecureToken, COMPANY_INVITE_TTL_MS } from "@/lib/tokens";
import { isPartnerOffer } from "@/lib/partner-offers";
import { invitePartnerSchema, partnerSettingsSchema } from "@/lib/validations/partner";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const EMAIL_FAILED_WARNING =
  "Invitation enregistrée, mais l'e-mail n'a pas pu être envoyé. Utilisez « Renvoyer » pour réessayer.";

/**
 * Module 20 — l'admin invite le gérant d'un partenaire sur une offre
 * partenaire (offre à 0, non proposée à l'inscription). Rien d'autre n'est
 * créé ici : le gérant crée son compte et son entreprise depuis le lien
 * reçu par e-mail (app/actions/partner-invite.ts).
 */
export async function invitePartner(
  input: unknown
): Promise<ActionResult<{ id: string; warning?: string }>> {
  const { userId: adminId } = await requireAdmin("entreprises");

  const parsed = invitePartnerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  const email = f.email.toLowerCase().trim();

  const plan = await prisma.plan.findUnique({ where: { id: f.planId } });
  if (!plan || !isPartnerOffer(plan)) {
    return { success: false, error: "Cette offre n'est pas une offre partenaire active." };
  }

  if (await prisma.user.findUnique({ where: { email } })) {
    return { success: false, error: "Un compte existe déjà avec cet e-mail." };
  }
  const pending = await prisma.partnerInvite.findFirst({
    where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (pending) {
    return {
      success: false,
      error: "Une invitation partenaire est déjà en attente pour cet e-mail.",
    };
  }

  const invite = await prisma.partnerInvite.create({
    data: {
      name: f.name,
      email,
      planId: plan.id,
      memberLimit: f.memberLimit,
      counterpart: f.counterpart || null,
      token: generateSecureToken(),
      expiresAt: new Date(Date.now() + COMPANY_INVITE_TTL_MS),
      invitedById: adminId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "partner.invite",
      targetType: "PartnerInvite",
      targetId: invite.id,
      metadata: { email, planId: plan.id, memberLimit: f.memberLimit },
    },
  });

  const sent = await sendPartnerInviteEmail(invite.id);
  revalidatePath("/admin/entreprises");
  return {
    success: true,
    data: { id: invite.id, ...(sent ? {} : { warning: EMAIL_FAILED_WARNING }) },
  };
}

/** Renvoie l'invitation avec un nouveau lien valable 7 jours (aussi pour une invitation expirée). */
export async function resendPartnerInvite(
  inviteId: string
): Promise<ActionResult<{ warning?: string }>> {
  const { userId: adminId } = await requireAdmin("entreprises");

  const invite = await prisma.partnerInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== "PENDING") {
    return { success: false, error: "Cette invitation n'est plus en attente." };
  }

  await prisma.partnerInvite.update({
    where: { id: inviteId },
    data: { token: generateSecureToken(), expiresAt: new Date(Date.now() + COMPANY_INVITE_TTL_MS) },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "partner.resend",
      targetType: "PartnerInvite",
      targetId: inviteId,
    },
  });

  const sent = await sendPartnerInviteEmail(inviteId);
  revalidatePath("/admin/entreprises");
  return { success: true, data: sent ? {} : { warning: EMAIL_FAILED_WARNING } };
}

export async function revokePartnerInvite(inviteId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("entreprises");

  const { count } = await prisma.partnerInvite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  if (count === 0) return { success: false, error: "Cette invitation n'est plus en attente." };

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "partner.revoke",
      targetType: "PartnerInvite",
      targetId: inviteId,
    },
  });
  revalidatePath("/admin/entreprises");
  return { success: true, data: undefined };
}

/** Nombre de membres et contrepartie d'une entreprise partenaire, modifiables depuis sa fiche admin. */
export async function updatePartnerSettings(
  companyId: string,
  input: unknown
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("entreprises");

  const parsed = partnerSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const subscription = await prisma.companySubscription.findUnique({
    where: { companyId },
    include: { plan: true },
  });
  if (!subscription || !isPartnerOffer(subscription.plan)) {
    return { success: false, error: "Cette entreprise n'est pas sur une offre partenaire." };
  }

  await prisma.companySubscription.update({
    where: { companyId },
    data: { memberLimit: parsed.data.memberLimit, counterpart: parsed.data.counterpart || null },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "partner.update_settings",
      targetType: "Company",
      targetId: companyId,
      metadata: { memberLimit: parsed.data.memberLimit },
    },
  });

  revalidatePath(`/admin/entreprises/${companyId}`);
  revalidatePath(`/entreprises/${companyId}`);
  return { success: true, data: undefined };
}

/** Un échec d'envoi n'annule pas l'invitation : il est signalé à l'admin, qui peut renvoyer. */
async function sendPartnerInviteEmail(inviteId: string): Promise<boolean> {
  const invite = await prisma.partnerInvite.findUnique({
    where: { id: inviteId },
    include: { plan: { select: { name: true } } },
  });
  if (!invite) return false;
  try {
    const email = await resolveEmail("partner-invite", {
      inviteeFirstName: invite.name.split(" ")[0],
      offerName: invite.plan.name,
      memberLimit: String(invite.memberLimit ?? ""),
      inviteUrl: `${process.env.NEXTAUTH_URL}/partenaire/${invite.token}`,
    });
    if (email) await sendTransactionalEmail({ to: invite.email, ...email });
    return true;
  } catch (err) {
    console.error("[partner invite] failed to send invite email", err);
    return false;
  }
}
