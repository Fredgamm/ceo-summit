"use client";

import * as React from "react";

import {
  pushAvailability,
  urlBase64ToUint8Array,
  type PushAvailability,
} from "@/lib/push-availability";
import { getPushPublicKey, removePushSubscription, savePushSubscription } from "@/app/actions/push";

/** Notifications push côté navigateur (module 24, 4 nov. 2026) — règles dans `push-availability.ts`. */

const READY_TIMEOUT_MS = 4000;

/** Le service worker n'existe pas en développement : on n'attend pas indéfiniment. */
async function serviceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
  ]);
}

function detectIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function usePush() {
  const [availability, setAvailability] = React.useState<PushAvailability | "loading">("loading");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const hasPushApi =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let subscribed = false;
    let configured = true;
    if (hasPushApi) {
      configured = (await getPushPublicKey().catch(() => null)) !== null;
      const registration = await serviceWorkerReady();
      if (!registration) {
        setAvailability("unsupported");
        return;
      }
      subscribed = (await registration.pushManager.getSubscription()) !== null;
    }
    setAvailability(
      pushAvailability({
        hasPushApi,
        isIos: detectIos(),
        standalone: detectStandalone(),
        configured,
        permission: hasPushApi ? Notification.permission : "unavailable",
        subscribed,
      })
    );
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await refresh();
        return;
      }
      const publicKey = await getPushPublicKey();
      const registration = await serviceWorkerReady();
      if (!publicKey || !registration) throw new Error("Notifications indisponibles.");
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const json = subscription.toJSON();
      const saved = await savePushSubscription({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent.slice(0, 300),
      });
      if (!saved.success) throw new Error(saved.error);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation impossible.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await serviceWorkerReady();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Désactivation impossible.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { availability, busy, error, enable, disable };
}
