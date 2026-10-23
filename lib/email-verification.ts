import { prisma } from "@/lib/prisma";
import { getPreregistrationStatus } from "@/lib/preregistration";
import { formatDateFr } from "@/lib/utils";
import { resolveEmail } from "@/lib/email-template-resolver";
import { sendTransactionalEmail } from "@/lib/resend";
import { appUrl } from "@/lib/app-url";
import { EMAIL_VERIFICATION_TOKEN_TTL_MS, generateSecureToken } from "@/lib/tokens";

/**
 * 14 oct. 2026 — une inscription avec une adresse inventée (domaine réel
 * compris) passait jusqu'au paiement. Le gestionnaire confirme désormais son
 * adresse par un lien à usage unique avant de pouvoir payer
 * (app/entreprise/paiement/page.tsx, submitPaymentProof). Réutilise
 * `ActivationToken`, qui ne servait plus depuis le parcours sans activation.
 */

/** Crée un nouveau lien (les précédents non utilisés sont retirés) et l'envoie. */
export async function sendEmailVerification(user: {
  id: string;
  name: string;
  email: string;
}): Promise<boolean> {
  const token = generateSecureToken();
  await prisma.$transaction([
    prisma.activationToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.activationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
      },
    }),
  ]);

  try {
    const email = await resolveEmail("email-verification", {
      memberName: user.name,
      verifyUrl: `${appUrl()}/verifier-email/${token}`,
    });
    if (!email) return false;
    await sendTransactionalEmail({ to: user.email, ...email });
    return true;
  } catch (err) {
    console.error("[sendEmailVerification] failed to send verification email", err);
    return false;
  }
}

export type VerifyEmailResult =
  | { status: "verified"; userId: string; alreadyVerified: boolean }
  | { status: "invalid" | "expired" };

/** Consomme le lien et marque l'adresse comme confirmée. */
export async function verifyEmailToken(token: string): Promise<VerifyEmailResult> {
  const record = await prisma.activationToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, emailVerifiedAt: true } } },
  });
  if (!record) return { status: "invalid" };
  // Lien déjà utilisé (double clic, aperçu du lien par la messagerie) : sans effet.
  if (record.usedAt) {
    return record.user.emailVerifiedAt
      ? { status: "verified", userId: record.userId, alreadyVerified: true }
      : { status: "invalid" };
  }
  if (record.expiresAt < new Date()) return { status: "expired" };

  const now = new Date();
  const { count } = await prisma.activationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (count === 0) {
    return { status: "verified", userId: record.userId, alreadyVerified: true };
  }
  await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerifiedAt: record.user.emailVerifiedAt ?? now },
  });
  return {
    status: "verified",
    userId: record.userId,
    alreadyVerified: record.user.emailVerifiedAt != null,
  };
}

/**
 * E-mail de bienvenue du gestionnaire (« company-admin-welcome »), envoyé
 * une fois son adresse confirmée — avant le 14 oct. 2026, dès l'inscription.
 */
export async function sendCompanyAdminWelcome(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { include: { subscription: { include: { plan: true } } } } },
    });
    const company = user?.company;
    if (!user || !company || company.companyAdminId !== user.id || !company.subscription) return;
    // 23 oct. 2026 — préinscription : pas de « procédez au paiement » tant
    // que les paiements sont fermés.
    const preregistration = await getPreregistrationStatus();
    const email =
      preregistration.active && preregistration.paymentsOpenAt
        ? await resolveEmail("company-admin-welcome-preregistration", {
            adminName: user.name,
            companyName: company.name,
            planName: company.subscription.plan.name,
            paymentsOpenDate: formatDateFr(preregistration.paymentsOpenAt),
            preregistrationUrl: `${appUrl()}/entreprise/paiement`,
          })
        : await resolveEmail("company-admin-welcome", {
            adminName: user.name,
            companyName: company.name,
            planName: company.subscription.plan.name,
            paymentUrl: `${appUrl()}/entreprise/paiement`,
          });
    if (email) await sendTransactionalEmail({ to: user.email, ...email });
  } catch (err) {
    console.error("[sendCompanyAdminWelcome] failed to send admin welcome email", err);
  }
}
