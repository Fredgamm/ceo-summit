"use client";

import { useEffect } from "react";

/**
 * next-pwa is disabled in dev (next.config.mjs), but a Service Worker
 * registered during an earlier `npm run build && npm start` on the same
 * origin (e.g. testing production mode on :3000) keeps running regardless —
 * browsers don't drop a registration just because the dev server stopped
 * injecting one. It then serves stale cached pages/JS under `next dev`,
 * producing hard-to-diagnose symptoms (stale Server Action ids, forms
 * posting to the wrong route, handlers that silently no-op). This
 * self-heals any dev browser profile on load; entirely stripped from
 * production builds by the NODE_ENV check below (dead-code-eliminated).
 */
export function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    }
  }, []);

  return null;
}
