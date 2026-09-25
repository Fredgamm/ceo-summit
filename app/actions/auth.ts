"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { setPasswordSchema, emailSchema } from "@/lib/validations/auth";
import {
  generateSecureToken,
  ACTIVATION_TOKEN_TTL_MS,
  ACTIVATION_RESEND_WINDOW_MS,
  MAX_ACTIVATION_RESENDS_PER_DAY,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "@/lib/tokens";
import { sendTransactionalEmail } from "@/lib/resend";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { tierLabel } from "@/lib/utils";
import ActivationEmail from "@/emails/activation-email";
import ResetPasswordEmail from "@/emails/reset-password-email";
import PasswordChangedEmail from "@/emails/password-changed-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const RATE_LIMITED_ERROR = "Trop de tentatives depuis cette adresse. Réessayez plus tard.";

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

  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);

  // 25 septembre 2026 (audit MVP) — consommation atomique du token : les
  // vérifications ci-dessus (findUnique puis `usedAt`) laissaient deux
  // requêtes concurrentes passer toutes les deux avant que l'une ne marque
  // le token utilisé (le hash bcrypt élargit la fenêtre à ~250 ms). Le
  // `updateMany` conditionné sur `usedAt: null` ne peut réussir qu'une fois.
  const user = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.activationToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;
    return tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, status: "ACTIVE", emailVerifiedAt: now },
    });
  });
  if (!user) return { success: false, error: "Ce lien a déjà été utilisé." };

  return { success: true, data: { email: user.email } };
}

// ═══════════════════════════════════════════════
// E1-T03 — Renvoi du lien d'activation
// Ref: phase1_evolia_membres.md UC-P1-05 / Écran E3 / Parcours P3
// ═══════════════════════════════════════════════

type ResendActivationResult =
  { success: true; data: undefined } | { success: false; error: string };

/**
 * 25 septembre 2026 (audit MVP) — la spec (Parcours P3) voulait
 * "aucun compte trouvé" / "déjà actif" / "trop de renvois" affichés
 * explicitement ici, ce qui faisait de ce formulaire public (sans compte,
 * sans rate limit) un oracle d'énumération des membres et de leur statut.
 * Désormais, comme requestPasswordReset : rate limit par IP, puis réponse
 * neutre identique dans tous les cas — l'email n'est réellement envoyé que
 * pour un compte existant encore en PENDING_ACTIVATION, sous le plafond
 * RG-P1-04.
 */
export async function resendActivationLink(email: string): Promise<ResendActivationResult> {
  const rateLimit = await checkRateLimit(`activation-resend:${getClientIp()}`, 5, 60 * 60);
  if (!rateLimit.allowed) {
    return { success: false, error: RATE_LIMITED_ERROR };
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Email invalide" };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.toLowerCase() } });
  if (!user || user.status !== "PENDING_ACTIVATION") {
    return { success: true, data: undefined };
  }

  // RG-P1-04 — max 3 resends per email per 24h (silencieux, voir ci-dessus).
  const recentCount = await prisma.activationToken.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - ACTIVATION_RESEND_WINDOW_MS) },
    },
  });
  if (recentCount >= MAX_ACTIVATION_RESENDS_PER_DAY) {
    return { success: true, data: undefined };
  }

  const token = generateSecureToken();
  await prisma.activationToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS) },
  });

  const activationUrl = `${process.env.NEXTAUTH_URL}/activer/${token}`;
  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: "Votre nouveau lien d'activation CEO Summit",
      react: ActivationEmail({
        memberName: user.name,
        // Correctif (7 août 2026, audit) — utilisait une copie locale de
        // tierLabel() dupliquant lib/utils.ts, avec un texte de repli anglais
        // ("Member") détonnant dans un email entièrement en français —
        // désormais "Membre", cohérent avec le reste de la plateforme.
        tier: tierLabel(undefined),
        activationUrl,
      }),
    });
  } catch (err) {
    // Réponse neutre là aussi : un échec d'envoi n'est possible que pour un
    // compte existant, le signaler le révélerait.
    console.error("[resendActivationLink] failed to send activation email", err);
  }

  return { success: true, data: undefined };
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
  // Sprint de correction (5 août 2026, EX-T01) — anti-spam par IP : sans
  // ça, un même visiteur pouvait déclencher un envoi Resend illimité vers
  // n'importe quel email existant.
  const rateLimit = await checkRateLimit(`password-reset:${getClientIp()}`, 5, 60 * 60);
  if (!rateLimit.allowed) {
    return { success: false, error: RATE_LIMITED_ERROR };
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Email invalide" };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.toLowerCase() } });

  if (user && user.status !== "SUSPENDED" && user.status !== "CANCELLED") {
    const token = generateSecureToken();
    // 25 septembre 2026 (audit MVP) — chaque demande laissait les liens
    // précédents valides jusqu'à leur expiration : seul le plus récent doit
    // pouvoir servir (un ancien email intercepté/transféré ne vaut plus rien).
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
        },
      }),
    ]);

    const resetUrl = `${process.env.NEXTAUTH_URL}/reinitialiser/${token}`;
    try {
      await sendTransactionalEmail({
        to: user.email,
        subject: "Réinitialisez votre mot de passe CEO Summit",
        react: ResetPasswordEmail({ memberName: user.name, resetUrl }),
      });
    } catch (err) {
      // Toujours "success" ci-dessous (anti-enumeration, voir la doc de
      // cette fonction) — un échec d'envoi ne doit donc pas non plus le
      // révéler en faisant échouer l'action.
      console.error("[requestPasswordReset] failed to send reset email", err);
    }
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

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!record) return { success: false, error: "Lien invalide." };
  if (record.usedAt) return { success: false, error: "Ce lien a déjà été utilisé." };
  if (record.expiresAt < new Date()) {
    return { success: false, error: "Ce lien a expiré. Demandez-en un nouveau." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);

  // 25 septembre 2026 (audit MVP) — consommation atomique, même raison
  // qu'activateAccount : deux requêtes concurrentes ne peuvent plus
  // réutiliser le même lien.
  const consumed = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    // passwordChangedAt — invalide les sessions ouvertes avant ce changement
    // (lib/require-viewer.ts::isViewerSessionValid).
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: now },
    });
    return true;
  });
  if (!consumed) return { success: false, error: "Ce lien a déjà été utilisé." };

  /**
   * 22 septembre 2026 (audit des emails transactionnels) — confirmation
   * sécurité standard, permet au titulaire légitime de détecter une prise
   * de contrôle de compte.
   */
  try {
    await sendTransactionalEmail({
      to: record.user.email,
      subject: "Votre mot de passe CEO Summit a été modifié",
      react: PasswordChangedEmail({ memberName: record.user.name }),
    });
  } catch (err) {
    console.error("[resetPassword] failed to send confirmation email", err);
  }

  return { success: true, data: undefined };
}
