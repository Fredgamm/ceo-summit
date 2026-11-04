/**
 * Règles pures des notifications push côté navigateur (module 24) — séparées du
 * hook (`push-client.ts`) pour être testées sans navigateur.
 *
 * Sur iPhone (iOS 16.4 et plus), le push n'existe que dans l'application
 * ajoutée à l'écran d'accueil ; dans Safari, l'API est absente. On l'explique
 * au lieu de masquer le bouton. Sur Android et ordinateur, il marche depuis le
 * navigateur comme depuis l'application installée.
 */

export type PushAvailability =
  | "unsupported" // navigateur sans push
  | "ios-install" // iPhone / iPad : à installer sur l'écran d'accueil d'abord
  | "unconfigured" // serveur sans clés VAPID
  | "denied" // permission refusée dans les réglages du navigateur
  | "off" // possible, pas encore activé sur cet appareil
  | "on"; // activé sur cet appareil

export function pushAvailability(input: {
  hasPushApi: boolean;
  isIos: boolean;
  standalone: boolean;
  configured: boolean;
  permission: NotificationPermission | "unavailable";
  subscribed: boolean;
}): PushAvailability {
  if (!input.hasPushApi) {
    return input.isIos && !input.standalone ? "ios-install" : "unsupported";
  }
  if (!input.configured) return "unconfigured";
  if (input.permission === "denied") return "denied";
  return input.subscribed && input.permission === "granted" ? "on" : "off";
}

/** Clé VAPID publique (base64 URL) → octets, format attendu par `pushManager.subscribe`. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
