import { randomBytes } from "crypto";

/**
 * Cryptographically secure, URL-safe tokens for password resets and
 * company invitations. Not JWTs — these are opaque, single-use, stored in the
 * DB (PasswordResetToken / CompanyInvite) and checked against expiresAt/usedAt.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — architecture doc
// 7 jours : accepter une invitation dépend d'un collègue, pas de soi-même.
export const COMPANY_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 14 oct. 2026 — confirmation de l'adresse du gestionnaire avant paiement.
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
// 25 oct. 2026 — lien envoyé à un administrateur créé depuis Admin › Paramètres.
export const ADMIN_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
