import { prisma } from "@/lib/prisma";
import { decryptSetting } from "@/lib/settings-crypto";

/**
 * 21 oct. 2026 — envoi des communications (diffusions de /admin/communications)
 * par l'API transactionnelle de Brevo, prévu pour des envois à 1000 membres et
 * plus : un seul appel porte jusqu'à 1000 destinataires (`messageVersions`),
 * chacun avec ses propres valeurs ({{ params.prenom }}…). Les e-mails
 * automatiques (mot de passe, paiements…) restent sur le SMTP de ceo-summit.mg
 * (lib/resend.ts) : un incident Brevo ne bloque jamais un e-mail critique.
 *
 * Réglages saisis dans /admin/parametres › Intégrations (clé chiffrée, voir
 * lib/settings-crypto.ts), à défaut BREVO_API_KEY / BREVO_SENDER_EMAIL /
 * BREVO_SENDER_NAME. Sans clé, les diffusions repartent par le SMTP.
 */

export const BREVO_SETTING_KEYS = {
  apiKey: "brevo.api_key",
  senderEmail: "brevo.sender_email",
  senderName: "brevo.sender_name",
} as const;

const API_BASE = "https://api.brevo.com/v3";
const REQUEST_TIMEOUT_MS = 30_000;
/** Plafond de `messageVersions` par appel, fixé par Brevo. */
export const BREVO_MAX_VERSIONS_PER_CALL = 1000;
export const DEFAULT_SENDER_NAME = "CEO Summit Indian Ocean";

export type BrevoSource = "admin" | "env" | "none";

export interface BrevoConfig {
  apiKey: string | null;
  senderEmail: string | null;
  senderName: string;
  source: BrevoSource;
  /** Clé enregistrée en base mais impossible à déchiffrer. */
  unreadable: boolean;
  updatedAt: Date | null;
}

export async function getBrevoConfig(): Promise<BrevoConfig> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.values(BREVO_SETTING_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const keyRow = byKey.get(BREVO_SETTING_KEYS.apiKey);
  const adminKey = keyRow ? decryptSetting(keyRow.value, BREVO_SETTING_KEYS.apiKey) : null;
  if (keyRow && !adminKey) {
    console.error("[brevo] clé d'API enregistrée illisible — repli sur BREVO_API_KEY");
  }
  const envKey = process.env.BREVO_API_KEY || null;

  return {
    apiKey: adminKey ?? envKey,
    senderEmail:
      byKey.get(BREVO_SETTING_KEYS.senderEmail)?.value ||
      process.env.BREVO_SENDER_EMAIL ||
      process.env.EMAIL_FROM ||
      null,
    senderName:
      byKey.get(BREVO_SETTING_KEYS.senderName)?.value ||
      process.env.BREVO_SENDER_NAME ||
      DEFAULT_SENDER_NAME,
    source: adminKey ? "admin" : envKey ? "env" : "none",
    unreadable: Boolean(keyRow && !adminKey),
    updatedAt: adminKey ? (keyRow?.updatedAt ?? null) : null,
  };
}

/** Brevo est utilisable : une clé et une adresse d'expéditeur. */
export function isBrevoReady(config: BrevoConfig): config is BrevoConfig & {
  apiKey: string;
  senderEmail: string;
} {
  return Boolean(config.apiKey && config.senderEmail);
}

export class BrevoError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = "BrevoError";
  }
}

/** Message lisible pour l'admin, d'après le code et le corps de la réponse Brevo. */
function describeBrevoFailure(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    detail = parsed.message ?? "";
  } catch {
    detail = body.slice(0, 300);
  }
  if (status === 401)
    return "Clé d'API Brevo refusée : vérifiez-la dans Paramètres › Intégrations.";
  if (status === 402) return "Crédits d'envoi Brevo épuisés : rechargez le compte Brevo.";
  if (/sender/i.test(detail)) {
    return `Expéditeur refusé par Brevo : l'adresse doit être validée dans votre compte Brevo (${detail}).`;
  }
  return `Brevo a refusé l'envoi (HTTP ${status})${detail ? ` : ${detail}` : "."}`;
}

async function brevoFetch(apiKey: string, path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "api-key": apiKey,
        accept: "application/json",
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new BrevoError(`Brevo injoignable : ${(err as Error).message}`, null);
  }
  const text = await response.text();
  if (!response.ok)
    throw new BrevoError(describeBrevoFailure(response.status, text), response.status);
  return text ? JSON.parse(text) : {};
}

export interface BrevoRecipient {
  email: string;
  name?: string;
  /** Valeurs propres à ce destinataire, lues dans le contenu via {{ params.<clé> }}. */
  params?: Record<string, string>;
}

export interface BrevoSendResult {
  delivered: boolean;
  messageId: string | null;
}

/**
 * Un même message envoyé à une liste de destinataires, par appels de 1000.
 * Renvoie, dans l'ordre des destinataires, si Brevo a accepté l'envoi et son
 * identifiant ; un appel refusé n'empêche pas les suivants de partir.
 */
export async function sendBrevoBatch(
  config: BrevoConfig & { apiKey: string; senderEmail: string },
  message: {
    subject: string;
    htmlContent: string;
    textContent: string;
    replyTo?: string;
    tag?: string;
  },
  recipients: BrevoRecipient[]
): Promise<{ results: BrevoSendResult[]; errors: string[] }> {
  const results: BrevoSendResult[] = [];
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += BREVO_MAX_VERSIONS_PER_CALL) {
    const chunk = recipients.slice(i, i + BREVO_MAX_VERSIONS_PER_CALL);
    try {
      const data = (await brevoFetch(config.apiKey, "/smtp/email", {
        method: "POST",
        body: JSON.stringify({
          sender: { email: config.senderEmail, name: config.senderName },
          subject: message.subject,
          htmlContent: message.htmlContent,
          textContent: message.textContent,
          ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
          ...(message.tag ? { tags: [message.tag] } : {}),
          messageVersions: chunk.map((r) => ({
            to: [{ email: r.email, ...(r.name ? { name: r.name } : {}) }],
            ...(r.params ? { params: r.params } : {}),
          })),
        }),
      })) as { messageId?: string; messageIds?: string[] };
      const ids = data.messageIds ?? (data.messageId ? [data.messageId] : []);
      chunk.forEach((_, j) => results.push({ delivered: true, messageId: ids[j] ?? null }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[brevo] batch send failed", { from: i, size: chunk.length, message });
      errors.push(message);
      chunk.forEach(() => results.push({ delivered: false, messageId: null }));
    }
  }
  return { results, errors };
}

export interface BrevoAccountStatus {
  email: string;
  companyName: string | null;
  /** Crédits d'envoi restants par offre (« free », « payAsYouGo »…). */
  credits: { type: string; credits: number }[];
}

/** Vérifie la clé et renvoie le compte et ses crédits (bouton « Tester la connexion »). */
export async function getBrevoAccount(apiKey: string): Promise<BrevoAccountStatus> {
  const data = (await brevoFetch(apiKey, "/account")) as {
    email: string;
    companyName?: string;
    plan?: { type: string; credits?: number; creditsType?: string }[];
  };
  return {
    email: data.email,
    companyName: data.companyName ?? null,
    credits: (data.plan ?? [])
      .filter((p) => typeof p.credits === "number")
      .map((p) => ({ type: p.type, credits: p.credits as number })),
  };
}
