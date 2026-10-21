import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";

/**
 * 21 oct. 2026 — configuration Evolia saisie dans /admin/parametres
 * (onglet Intégrations) plutôt que dans le `.env` du serveur. Les trois
 * valeurs sont fournies par Evolia : l'adresse de leur API d'inscription, le
 * lien de leur page de paiement et la clé partagée.
 *
 * Une seule clé, dans les deux sens : elle signe nos envois vers Evolia et
 * vérifie leurs confirmations de paiement sur notre webhook (c'est la même
 * aujourd'hui dans EVOLIA_WEBHOOK_SECRET et PAYMENT_WEBHOOK_SECRET).
 *
 * Priorité : valeur saisie par l'admin (`PlatformSetting`) > variable
 * d'environnement > valeur par défaut. Tant que rien n'est saisi, le
 * comportement reste exactement celui d'avant.
 *
 * La clé est chiffrée au repos (AES-256-GCM) et ne quitte jamais le serveur :
 * l'interface n'en reçoit que les 4 derniers caractères. La clé de
 * chiffrement est dérivée (HKDF) de NEXTAUTH_SECRET, déjà présent sur chaque
 * serveur — si ce secret change, la clé stockée devient illisible : la
 * plateforme repasse sur les variables d'environnement et l'onglet
 * Intégrations demande de la ressaisir.
 */

export const EVOLIA_SETTING_KEYS = {
  registrationUrl: "evolia.registration_url",
  paymentUrl: "evolia.payment_url",
  secret: "evolia.webhook_secret",
} as const;

export type EvoliaUrlField = "registrationUrl" | "paymentUrl";

export const DEFAULT_REGISTRATION_URL =
  "https://api-event.aiolia.us/integration/ceosummit/registrations";
export const DEFAULT_PAYMENT_URL =
  "https://event.aiolia.us/ceosummit/payment/{ceoSummitReference}";
export const PAYMENT_URL_PLACEHOLDER = "{ceoSummitReference}";

// ─── Chiffrement ──────────────────────────────────────────────────────────

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

// ─── Lecture ──────────────────────────────────────────────────────────────

export type SettingSource = "admin" | "env" | "default" | "none";

async function loadSettings() {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.values(EVOLIA_SETTING_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const url = (field: EvoliaUrlField, envName: string, fallback: string) => {
    const row = byKey.get(EVOLIA_SETTING_KEYS[field]);
    if (row) return { value: row.value, source: "admin" as SettingSource };
    const env = process.env[envName];
    if (env) return { value: env, source: "env" as SettingSource };
    return { value: fallback, source: "default" as SettingSource };
  };

  const secretRow = byKey.get(EVOLIA_SETTING_KEYS.secret);
  const adminSecret = secretRow ? decryptSetting(secretRow.value, EVOLIA_SETTING_KEYS.secret) : null;
  if (secretRow && !adminSecret) {
    console.error("[evolia-config] clé Evolia enregistrée illisible — repli sur l'environnement");
  }

  return {
    registrationUrl: url("registrationUrl", "EVOLIA_REGISTRATION_URL", DEFAULT_REGISTRATION_URL),
    paymentUrl: url("paymentUrl", "EVOLIA_PAYMENT_URL", DEFAULT_PAYMENT_URL),
    adminSecret,
    secretUnreadable: Boolean(secretRow && !adminSecret),
    secretUpdatedAt: adminSecret ? (secretRow?.updatedAt ?? null) : null,
  };
}

export interface EvoliaConfig {
  registrationUrl: string;
  paymentUrlTemplate: string;
  /** Signe nos envois vers Evolia. */
  outboundSecret: string | null;
  /** Vérifie leurs confirmations de paiement (webhook entrant). */
  inboundSecret: string | null;
}

/** Valeurs effectives, côté serveur uniquement (contient la clé en clair). */
export async function getEvoliaConfig(): Promise<EvoliaConfig> {
  const s = await loadSettings();
  return {
    registrationUrl: s.registrationUrl.value,
    paymentUrlTemplate: s.paymentUrl.value,
    outboundSecret: s.adminSecret ?? (process.env.EVOLIA_WEBHOOK_SECRET || null),
    inboundSecret: s.adminSecret ?? (process.env.PAYMENT_WEBHOOK_SECRET || null),
  };
}

export interface EvoliaSettingsStatus {
  registrationUrl: { value: string; source: SettingSource };
  paymentUrl: { value: string; source: SettingSource };
  secret: {
    source: SettingSource;
    /** « …ab12 » — jamais la clé entière. */
    hint: string | null;
    unreadable: boolean;
    updatedAt: string | null;
  };
}

/** Ce que l'onglet Intégrations peut afficher : jamais la clé en clair. */
export async function getEvoliaSettingsStatus(): Promise<EvoliaSettingsStatus> {
  const s = await loadSettings();
  const envSecret = process.env.EVOLIA_WEBHOOK_SECRET || null;
  const secret = s.adminSecret ?? envSecret;
  return {
    registrationUrl: s.registrationUrl,
    paymentUrl: s.paymentUrl,
    secret: {
      source: s.adminSecret ? "admin" : envSecret ? "env" : "none",
      hint: secret && secret.length >= 16 ? `…${secret.slice(-4)}` : null,
      unreadable: s.secretUnreadable,
      updatedAt: s.secretUpdatedAt?.toISOString() ?? null,
    },
  };
}
