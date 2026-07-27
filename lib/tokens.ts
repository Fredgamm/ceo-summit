import { randomBytes } from "crypto";

/**
 * Cryptographically secure, URL-safe tokens for activation links and
 * password resets. Not JWTs — these are opaque, single-use, stored in the
 * DB (ActivationToken / PasswordResetToken) and checked against expiresAt/usedAt.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

export const ACTIVATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h — architecture doc
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — architecture doc

// RG-P1-04 — max 3 activation-link resends per email per 24h (anti-abuse).
export const MAX_ACTIVATION_RESENDS_PER_DAY = 3;
export const ACTIVATION_RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
