import { createHmac, timingSafeEqual } from "crypto";

/**
 * Audit MVP (25 septembre 2026) — vérification des webhooks Resend, qui
 * signe via Svix (et non un simple HMAC hex dans `X-Resend-Signature` comme
 * le supposait la première version de la route) :
 * - en-têtes `svix-id`, `svix-timestamp` (secondes Unix), `svix-signature` ;
 * - secret `whsec_<base64>` (fourni par le tableau de bord Resend) — la clé
 *   HMAC est la partie base64 décodée ;
 * - signature = base64(HMAC-SHA256(clé, `${id}.${timestamp}.${corps brut}`)) ;
 * - `svix-signature` peut contenir plusieurs signatures `v1,<sig>` séparées
 *   par des espaces (rotation de secret) : une seule valide suffit.
 *
 * Implémenté à la main plutôt qu'avec le paquet `svix` pour ne pas ajouter
 * de dépendance pour une vingtaine de lignes. Tolérance de 5 minutes sur le
 * timestamp, contre le rejeu d'une requête interceptée.
 * Ref. https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
export const SVIX_TIMESTAMP_TOLERANCE_SEC = 5 * 60;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type SvixVerificationResult = { valid: true } | { valid: false; reason: string };

export function verifySvixSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  nowMs: number = Date.now()
): SvixVerificationResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { valid: false, reason: "Missing Svix headers" };
  }

  const timestampSec = Number(timestamp);
  if (!Number.isInteger(timestampSec)) {
    return { valid: false, reason: "Invalid Svix timestamp" };
  }
  if (Math.abs(nowMs / 1000 - timestampSec) > SVIX_TIMESTAMP_TOLERANCE_SEC) {
    return { valid: false, reason: "Svix timestamp outside tolerance" };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest();

  const matches = signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const received = Buffer.from(value, "base64");
    // Longueurs différentes = signature invalide, pas un crash de timingSafeEqual.
    return received.length === expected.length && timingSafeEqual(received, expected);
  });

  return matches ? { valid: true } : { valid: false, reason: "Svix signature mismatch" };
}
