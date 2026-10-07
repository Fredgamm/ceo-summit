"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { isPartnerOffer, partnershipEndDate } from "@/lib/partner-offers";
import { acceptPartnerInviteSchema } from "@/lib/validations/partner";
import { validateSectorAndCountry } from "@/app/actions/company";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

class InviteAlreadyConsumedError extends Error {}

/**
 * Module 20 — le gérant invité par l'admin crée son compte et son entreprise
 * depuis le lien reçu par e-mail. En une transaction : compte actif,
 * entreprise dont il est le gérant, abonnement **actif sans paiement** sur
 * l'offre partenaire de l'invitation, pour un an (même règle que les autres
 * offres), avec le nombre de membres et la contrepartie fixés par l'admin.
 */
export async function acceptPartnerInvite(
  token: string,
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  const rateLimit = await checkRateLimit(`partner-invite:${getClientIp()}`, 10, 60 * 60);
  if (!rateLimit.allowed) {
    return { success: false, error: "Trop de tentatives. Réessayez plus tard." };
  }

  const parsed = acceptPartnerInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  const invite = await prisma.partnerInvite.findUnique({
    where: { token },
    include: { plan: true },
  });
  if (!invite) return { success: false, error: "Invitation introuvable." };
  if (invite.status === "ACCEPTED") {
    return { success: false, error: "Cette invitation a déjà été utilisée. Connectez-vous." };
  }
  if (invite.status === "REVOKED")
    return { success: false, error: "Cette invitation a été annulée." };
  if (invite.expiresAt < new Date()) {
    return {
      success: false,
      error: "Cette invitation a expiré. Demandez à l'équipe CEO Summit de vous la renvoyer.",
    };
  }
  if (!isPartnerOffer(invite.plan)) {
    return {
      success: false,
      error: "Cette offre n'est plus disponible. Contactez l'équipe CEO Summit.",
    };
  }

  const referentialError = await validateSectorAndCountry(f.sector, f.country);
  if (referentialError) return { success: false, error: referentialError };

  if (await prisma.user.findUnique({ where: { email: invite.email } })) {
    return {
      success: false,
      error: "Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.",
    };
  }

  const passwordHash = await bcrypt.hash(f.password, BCRYPT_ROUNDS);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Consommée une seule fois, même sur un double clic ou deux onglets.
      const { count } = await tx.partnerInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: now },
      });
      if (count === 0) throw new InviteAlreadyConsumedError();

      const user = await tx.user.create({
        data: { name: invite.name, email: invite.email, passwordHash, status: "ACTIVE" },
      });
      const company = await tx.company.create({
        data: {
          name: f.companyName,
          sector: f.sector,
          country: f.country,
          companyAdminId: user.id,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { companyId: company.id } });
      await tx.companySubscription.create({
        data: {
          companyId: company.id,
          planId: invite.planId,
          status: "ACTIVE",
          startDate: now,
          endDate: partnershipEndDate(now),
          memberLimit: invite.memberLimit,
          counterpart: invite.counterpart,
        },
      });
      await tx.partnerInvite.update({ where: { id: invite.id }, data: { companyId: company.id } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "partner.accept",
          targetType: "Company",
          targetId: company.id,
          metadata: { partnerInviteId: invite.id, planId: invite.planId },
        },
      });
    });
  } catch (err) {
    if (err instanceof InviteAlreadyConsumedError) {
      return { success: false, error: "Cette invitation a déjà été utilisée. Connectez-vous." };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        success: false,
        error: "Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.",
      };
    }
    throw err;
  }

  return { success: true, data: { email: invite.email } };
}
