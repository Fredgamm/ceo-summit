"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 21 oct. 2026 — barre de progression en haut de l'écran pendant une
 * navigation. Aucune page membre n'a de `loading.tsx` (chaque page rend son
 * propre AppShell, un fallback de segment ferait disparaître la navigation),
 * donc sans ce retour visuel un clic sur un lien ne montrait rien tant que
 * le serveur n'avait pas fini de rendre la page suivante.
 *
 * Démarre sur un clic de lien interne (capture sur `document`, avant le
 * `preventDefault` de next/link), se termine quand l'URL change. Les
 * navigations déclenchées par `router.push` depuis du code ne sont pas
 * détectées — elles ont en général leur propre état "en cours" (bouton).
 */
const SHOW_DELAY_MS = 120; // évite un flash sur les navigations instantanées (prefetch)
const SAFETY_TIMEOUT_MS = 15000; // redirection vers la même URL : rien ne change, on arrête

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }

  // Fin de navigation : l'URL a changé.
  useEffect(() => {
    clearTimers();
    setProgress((current) => (current === null ? null : 100));
    const hide = window.setTimeout(() => setProgress(null), 250);
    return () => window.clearTimeout(hide);
  }, [pathname, searchParams]);

  // Avancée lente tant que la page n'est pas arrivée, sans jamais atteindre 100.
  useEffect(() => {
    if (progress === null || progress >= 90) return;
    const id = window.setTimeout(
      () => setProgress((p) => (p === null || p >= 100 ? p : p + (90 - p) * 0.1)),
      200
    );
    return () => window.clearTimeout(id);
  }, [progress]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Même page (ou simple ancre #) : pas de navigation serveur.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      clearTimers();
      timers.current.push(
        window.setTimeout(() => setProgress((p) => p ?? 15), SHOW_DELAY_MS),
        window.setTimeout(() => setProgress(null), SAFETY_TIMEOUT_MS)
      );
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  if (progress === null) return null;

  return (
    <div
      role="progressbar"
      aria-label="Chargement de la page"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]"
    >
      <div
        className="h-full bg-gold shadow-[0_0_8px_rgba(201,168,76,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
