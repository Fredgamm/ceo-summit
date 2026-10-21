import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

/**
 * 21 oct. 2026 — chiffrement au repos des secrets saisis dans
 * /admin/parametres (clé Evolia, clé d'API Brevo), stockés dans
 * `PlatformSetting`. AES-256-GCM, clé dérivée (HKDF) de NEXTAUTH_SECRET : si ce
 * secret change, les valeurs stockées deviennent illisibles et doivent être
 * ressaisies (les appelants se replient alors sur les variables
 * d'environnement).
 */

const CIPHER_PREFIX = "enc:v1:";

function encryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set — see .env.example");
  return Buffer.from(hkdfSync("sha256", secret, "ceo-summit", "platform-settings/v1", 32));
}

/** `settingKey` sert de données authentifiées : un chiffré ne peut pas être recopié sur une autre ligne. */
export function encryptSetting(plaintext: string, settingKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(settingKey, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return CIPHER_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

/** `null` si la valeur est illisible (clé de chiffrement changée, donnée altérée). */
export function decryptSetting(stored: string, settingKey: string): string | null {
  if (!stored.startsWith(CIPHER_PREFIX)) return null;
  try {
    const raw = Buffer.from(stored.slice(CIPHER_PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(settingKey, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
