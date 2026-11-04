"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { sendPushToUser, vapidPublicKey } from "@/lib/push";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Notifications push de la PWA (module 24, 4 nov. 2026) — abonnement d'un
 * appareil du membre connecté. Le navigateur fournit l'adresse du service de
 * push et deux clés ; elles ne servent qu'à envoyer des notifications à cet
 * appareil, et sont retirées à la désactivation ou quand l'appareil les refuse.
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://"),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
  userAgent: z.string().max(300).optional(),
});

/** Clé publique à donner au navigateur ; `null` quand le serveur n'a pas de clés (push inactif). */
export async function getPushPublicKey(): Promise<string | null> {
  const viewer = await requireViewer();
  if (!viewer.success) return null;
  return vapidPublicKey();
}

export async function savePushSubscription(input: unknown): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!viewer.success) return { success: false, error: viewer.error };

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Abonnement invalide." };
  const { endpoint, keys, userAgent } = parsed.data;

  // Même appareil, autre compte (déconnexion puis reconnexion) : l'adresse change de propriétaire.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: viewer.viewer.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
    },
    update: {
      userId: viewer.viewer.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
    },
  });
  return { success: true, data: undefined };
}

export async function removePushSubscription(endpoint: unknown): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!viewer.success) return { success: false, error: viewer.error };
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return { success: false, error: "Abonnement invalide." };
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: viewer.viewer.id } });
  return { success: true, data: undefined };
}

/** Bouton « Envoyer un test » : une notification vers les appareils du membre. */
export async function sendTestPush(): Promise<ActionResult<{ delivered: number }>> {
  const viewer = await requireViewer();
  if (!viewer.success) return { success: false, error: viewer.error };
  const delivered = await sendPushToUser(viewer.viewer.id, {
    title: "Notifications activées",
    body: "Vous recevrez ici vos demandes de rendez-vous et leurs réponses.",
    url: "/notifications",
    tag: "push-test",
  });
  return { success: true, data: { delivered } };
}
