import webpush from "web-push";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";

/**
 * Notifications push de la PWA (module 24, 4 nov. 2026).
 *
 * Même règle que les emails : au mieux. Un push qui ne part pas (clés absentes,
 * appareil injoignable) est journalisé mais ne fait jamais échouer l'action du
 * membre. Sans clés VAPID (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`), tout est
 * inactif : le bouton d'activation n'apparaît pas et rien n'est envoyé.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Page ouverte au toucher de la notification (chemin, ex. « /profil?onglet=mes-rendez-vous »). */
  url: string;
  /** Deux notifications de même `tag` se remplacent au lieu de s'empiler. */
  tag?: string;
}

/** Le service de push refuse un message trop gros (≈ 4 Ko) : on reste très en dessous. */
const BODY_MAX = 140;
const TITLE_MAX = 60;
/** Une demande de rendez-vous qui n'a pas pu être livrée en 12 h n'a plus d'intérêt immédiat. */
const TTL_SECONDS = 12 * 3600;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function pushConfigured(): boolean {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Contenu réellement envoyé : textes raccourcis, lien interne uniquement. */
export function buildPushMessage(payload: PushPayload): string {
  const url = payload.url.startsWith("/") && !payload.url.startsWith("//") ? payload.url : "/";
  return JSON.stringify({
    title: clip(payload.title, TITLE_MAX),
    body: clip(payload.body, BODY_MAX),
    url,
    tag: payload.tag,
  });
}

let configured = false;
function configure(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || appUrl(),
      process.env.VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim()
    );
    configured = true;
  }
  return true;
}

/**
 * Envoie une notification à tous les appareils abonnés d'un membre. Renvoie le
 * nombre d'appareils atteints. Ne lève jamais.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  try {
    if (!configure()) return 0;
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return 0;

    const message = buildPushMessage(payload);
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message,
            { TTL: TTL_SECONDS }
          );
          await prisma.pushSubscription
            .update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
            .catch(() => undefined);
          return true;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Appareil désinscrit ou application désinstallée : l'adresse ne servira plus.
            await prisma.pushSubscription
              .deleteMany({ where: { id: sub.id } })
              .catch(() => undefined);
          } else {
            console.error("[push] envoi impossible", status ?? err);
          }
          return false;
        }
      })
    );
    return results.filter(Boolean).length;
  } catch (err) {
    console.error("[push] échec", err);
    return 0;
  }
}
