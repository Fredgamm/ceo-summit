/**
 * Notifications push (module 24, 4 nov. 2026) — code ajouté au service worker
 * généré par next-pwa (dossier `worker/`, lu par défaut par next-pwa).
 *
 * Ce fichier tourne dans le service worker, pas dans la page : pas de React, pas
 * d'import de l'application. Le message est un JSON { title, body, url, tag }
 * construit par `lib/push.ts` (le lien est toujours un chemin interne).
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CEO Summit";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Application déjà ouverte : on la ramène au premier plan sur la bonne page.
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client
            .focus()
            .then((focused) =>
              focused && "navigate" in focused ? focused.navigate(target) : undefined
            );
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
