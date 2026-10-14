"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { setPasswordSchema, emailSchema } from "@/lib/validations/auth";
import { generateSecureToken, PASSWORD_RESET_TOKEN_TTL_MS } from "@/lib/tokens";
import { sendTransactionalEmail } from "@/lib/resend";
import { resolveEmail } from "@/lib/email-template-resolver";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { BCRYPT_ROUNDS } from "@/lib/password";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const RATE_LIMITED_ERROR = "Trop de tentatives depuis cette adresse. Réessayez plus tard.";

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
  const rateLimit = await checkRateLimit(`password-reset:${await getClientIp()}`, 5, 60 * 60);
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
      const email = await resolveEmail("reset-password", { memberName: user.name, resetUrl });
      if (email) await sendTransactionalEmail({ to: user.email, ...email });
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
    const email = await resolveEmail("password-changed", { memberName: record.user.name });
    if (email) await sendTransactionalEmail({ to: record.user.email, ...email });
  } catch (err) {
    console.error("[resetPassword] failed to send confirmation email", err);
  }

  return { success: true, data: undefined };
}
