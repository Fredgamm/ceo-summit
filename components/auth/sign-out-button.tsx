"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Loader2, LogOut } from "lucide-react";

/**
 * Caches du service worker (next.config.mjs / next-pwa) qui peuvent contenir
 * des pages ou des réponses propres au compte connecté. Vidés à la
 * déconnexion : sinon le membre suivant sur le même appareil (ou le même
 * membre, hors connexion) pourrait revoir des pages du compte précédent.
 */
const USER_CACHE_NAMES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "apis",
  "next-data",
  "start-url",
  "ceo-summit-critical-pages",
  "ceo-summit-member-pages",
];

/** Au-delà, on considère la déconnexion bloquée et on passe par la page NextAuth. */
const SIGN_OUT_TIMEOUT_MS = 8000;

/**
 * 23 oct. 2026 — l'ancien service worker gardait /login (et la page
 * d'accueil) au précache, enregistrés par un navigateur connecté : c'était
 * en fait le tableau de bord, resservi sous /login après déconnexion. Le
 * nouveau service worker ne les précache plus ; en attendant qu'il remplace
 * l'ancien, on retire ces copies ici.
 */
const PRECACHED_USER_PAGES = ["/login", "/"];

async function clearUserCaches() {
  if (typeof caches === "undefined") return;
  try {
    await Promise.all(USER_CACHE_NAMES.map((name) => caches.delete(name)));
    const precaches = (await caches.keys()).filter((name) => name.includes("precache"));
    for (const name of precaches) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (PRECACHED_USER_PAGES.includes(new URL(request.url).pathname)) {
          await cache.delete(request);
        }
      }
    }
  } catch {
    // Cache Storage indisponible (navigation privée…) : rien à vider.
  }
}

/**
 * B1f (audit du 29 juillet 2026) — le lien "Déconnexion" de member-sidebar.tsx
 * n'appelait jamais next-auth/react's signOut() : c'était un simple
 * <Link href="/login">, donc la session restait valide et middleware.ts
 * renvoyait immédiatement l'utilisateur "déconnecté" vers /dashboard. Ce
 * composant est le point d'appel réel — utilisé ici et dans MemberSidebar.
 *
 * 21 oct. 2026 (déconnexion qui « ne fait rien ») — état « Déconnexion… »
 * pendant l'appel, caches du service worker vidés, puis `location.replace`
 * vers /login (pas de retour arrière sur une page du compte). Si signOut()
 * échoue ou traîne, repli sur la page de déconnexion de NextAuth, qui
 * fonctionne sans JavaScript.
 */
export function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = React.useState(false);

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    try {
      const result = (await Promise.race([
        signOut({ redirect: false }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), SIGN_OUT_TIMEOUT_MS)
        ),
      ])) as { url?: string } | undefined;
      // Jeton CSRF refusé : NextAuth ne lève pas d'erreur, il renvoie l'adresse
      // de sa page de confirmation, et la session reste ouverte.
      if (result?.url && /[?&](csrf=true|error=)/.test(result.url)) {
        throw new Error(`sign-out not confirmed: ${result.url}`);
      }
    } catch (err) {
      console.error("[sign-out] falling back to the NextAuth sign-out page", err);
      await clearUserCaches();
      window.location.assign("/api/auth/signout");
      return;
    }
    await clearUserCaches();
    window.location.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2} />
          <span>Déconnexion…</span>
        </>
      ) : (
        (children ?? (
          <>
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>Déconnexion</span>
          </>
        ))
      )}
    </button>
  );
}
