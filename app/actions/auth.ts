"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { setPasswordSchema, emailSchema, signupSchema } from "@/lib/validations/auth";
import {
  generateSecureToken,
  ACTIVATION_TOKEN_TTL_MS,
  ACTIVATION_RESEND_WINDOW_MS,
  MAX_ACTIVATION_RESENDS_PER_DAY,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "@/lib/tokens";
import { sendTransactionalEmail } from "@/lib/resend";
import ActivationEmail from "@/emails/activation-email";
import ResetPasswordEmail from "@/emails/reset-password-email";
import SignupConfirmEmail from "@/emails/signup-confirm-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

// ═══════════════════════════════════════════════
// Phase 2 offres/paiement (30 juillet 2026) — inscription self-service
// ═══════════════════════════════════════════════

/**
 * Porte d'entrée self-service : nom + email seulement, pas de champ
 * entreprise ici (voir app/actions/company.ts pour cette étape, volontairement
 * séparée pour ne pas alourdir le premier écran). Réutilise le mécanisme
 * ActivationToken existant — le mot de passe est choisi via le lien reçu par
 * email, exactement comme pour une candidature approuvée ou un paiement Evolia.
 */
export async function signup(name: string, email: string): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({ name, email });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const normalizedEmail = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return {
      success: false,
      error: "Un compte existe déjà avec cet email. Connectez-vous plutôt.",
    };
  }

  const user = await prisma.user.create({
    data: { name: parsed.data.name, email: normalizedEmail, status: "PENDING_ACTIVATION" },
  });

  const token = generateSecureToken();
  await prisma.activationToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS) },
  });

  const activationUrl = `${process.env.NEXTAUTH_URL}/activer/${token}`;
  await sendTransactionalEmail({
    to: user.email,
    subject: "Confirmez votre inscription CEO Summit",
    react: SignupConfirmEmail({ memberName: user.name, activationUrl }),
  });

  return { success: true, data: undefined };
}

// ═══════════════════════════════════════════════
// E1-T03 — Activation de compte
// ═══════════════════════════════════════════════

/**
 * Validates an activation token without consuming it — used by the page
 * component to decide which UI to render (form / expired / already used).
 */
export async function checkActivationToken(token: string) {
  const record = await prisma.activationToken.findUnique({
    where: { token },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!record) return { valid: false as const, reason: "NOT_FOUND" as const };
  if (record.usedAt) return { valid: false as const, reason: "ALREADY_USED" as const };
  if (record.expiresAt < new Date()) return { valid: false as const, reason: "EXPIRED" as const };

  return { valid: true as const, memberName: record.user.name, email: record.user.email };
}

/**
 * Consumes an activation token: sets the member's password, flips status to
 * ACTIVE, marks the token used. Ref: phase1_evolia_membres.md UC-P1-02.
 */
export async function activateAccount(
  token: string,
  password: string,
  confirmPassword: string
): Promise<ActionResult<{ email: string }>> {
  const parsed = setPasswordSchema.safeParse({ password, confirmPassword });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Mot de passe invalide" };
  }

  const record = await prisma.activationToken.findUnique({ where: { token } });
  if (!record) return { success: false, error: "Lien d'activation introuvable." };
  if (record.usedAt) return { success: false, error: "Ce lien a déjà été utilisé." };
  if (record.expiresAt < new Date()) {
    return {
      success: false,
      error: "Ce lien a expiré. Demandez-en un nouveau depuis la connexion.",
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    await tx.activationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return updated;
  });

  return { success: true, data: { email: user.email } };
}

// ═══════════════════════════════════════════════
// E1-T03 — Renvoi du lien d'activation
// Ref: phase1_evolia_membres.md UC-P1-05 / Écran E3 / Parcours P3
// ═══════════════════════════════════════════════

type ResendActivationResult =
  { success: true; data: undefined } | { success: false; error: string };

/**
 * Unlike password reset, the spec explicitly wants "no account found" and
 * "already active" surfaced to the user here (Parcours P3) — activation
 * resend is tied to a known Evolia payment, not a cold signup form, so
 * anti-enumeration doesn't apply the same way.
 */
export async function resendActivationLink(email: string): Promise<ResendActivationResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Email invalide" };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.toLowerCase() } });

  if (!user) {
    return {
      success: false,
      error: "Aucun compte trouvé pour cet email. Contactez l'équipe CEO Summit.",
    };
  }

  if (user.status !== "PENDING_ACTIVATION") {
    return { success: false, error: "Ce compte est déjà actif. Connectez-vous directement." };
  }

  // RG-P1-04 — max 3 resends per email per 24h.
  const recentCount = await prisma.activationToken.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - ACTIVATION_RESEND_WINDOW_MS) },
    },
  });
  if (recentCount >= MAX_ACTIVATION_RESENDS_PER_DAY) {
    return {
      success: false,
      error:
        "Trop de demandes de renvoi pour cet email. Réessayez dans 24h ou contactez l'équipe CEO Summit.",
    };
  }

  const latestMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const token = generateSecureToken();
  await prisma.activationToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS) },
  });

  const activationUrl = `${process.env.NEXTAUTH_URL}/activer/${token}`;
  await sendTransactionalEmail({
    to: user.email,
    subject: "Votre nouveau lien d'activation CEO Summit",
    react: ActivationEmail({
      memberName: user.name,
      tier: tierLabel(latestMembership?.tier),
      activationUrl,
    }),
  });

  return { success: true, data: undefined };
}

function tierLabel(tier?: "MEMBER" | "EXECUTIVE" | "CHAIRMAN") {
  return tier === "CHAIRMAN" ? "Chairman" : tier === "EXECUTIVE" ? "Executive" : "Member";
}

// ═══════════════════════════════════════════════
// E1-T06 — Mot de passe oublié
// ═══════════════════════════════════════════════

/**
 * Always returns success regardless of whether the email exists — prevents
 * account enumeration. The email is only actually sent if a matching,
 * activatable account is found.
 */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Email invalide" };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.toLowerCase() } });

  if (user && user.status !== "SUSPENDED" && user.status !== "CANCELLED") {
    const token = generateSecureToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/reinitialiser/${token}`;
    await sendTransactionalEmail({
      to: user.email,
      subject: "Réinitialisez votre mot de passe CEO Summit",
      react: ResetPasswordEmail({ memberName: user.name, resetUrl }),
    });
  }

  return { success: true, data: undefined };
}

export async function checkResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record) return { valid: false as const, reason: "NOT_FOUND" as const };
  if (record.usedAt) return { valid: false as const, reason: "ALREADY_USED" as const };
  if (record.expiresAt < new Date()) return { valid: false as const, reason: "EXPIRED" as const };

  return { valid: true as const };
}

export async function resetPassword(
  token: string,
  password: string,
  confirmPassword: string
): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse({ password, confirmPassword });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Mot de passe invalide" };
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record) return { success: false, error: "Lien invalide." };
  if (record.usedAt) return { success: false, error: "Ce lien a déjà été utilisé." };
  if (record.expiresAt < new Date()) {
    return { success: false, error: "Ce lien a expiré. Demandez-en un nouveau." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return { success: true, data: undefined };
}
