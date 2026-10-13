"use client";

import * as React from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { promptPwaInstall, usePwaInstall } from "@/lib/pwa-install";

const VISIT_COUNT_KEY = "ceo-summit-visit-count";
const DISMISSED_KEY = "ceo-summit-install-dismissed";
const MIN_VISITS_BEFORE_PROMPT = 2;

/**
 * E9-T05 — "Ajouter à l'écran d'accueil". Android/Chrome gets the native
 * `beforeinstallprompt` banner (after the 2nd visit, matching the backlog's
 * "bannière contextuelle" ask); iOS Safari never fires that event at all, so
 * it gets a static guide instead ("Partager → Sur l'écran d'accueil").
 * Dismissal and visit count persist in localStorage — no PlatformSetting
 * needed, this is purely a client-side UX nudge.
 *
 * 10 oct. 2026 — l'événement d'installation est partagé avec l'entrée de
 * menu « Installer l'application » (lib/pwa-install.ts) : le navigateur ne
 * permet de l'utiliser qu'une fois.
 */
export function InstallPrompt() {
  const { installed, canPrompt, platform } = usePwaInstall();
  const [eligible, setEligible] = React.useState(false);

  React.useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
      const visits = Number(localStorage.getItem(VISIT_COUNT_KEY) ?? "0") + 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(visits));
      if (visits >= MIN_VISITS_BEFORE_PROMPT) setEligible(true);
    } catch {
      // Stockage indisponible (navigation privée stricte) : pas de bannière.
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignoré
    }
    setEligible(false);
  }

  async function handleInstall() {
    const outcome = await promptPwaInstall();
    if (outcome === "accepted") dismiss();
  }

  const showIosGuide = platform === "ios";
  if (installed || !eligible || (!canPrompt && !showIosGuide)) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+70px)] z-[190] rounded-lg bg-navy p-4 text-white shadow-card-md md:inset-x-auto md:bottom-4 md:left-[236px] md:w-80">
      <button
        onClick={dismiss}
        aria-label="Fermer"
        className="absolute right-2 top-2 rounded p-1 text-white/50 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      {showIosGuide ? (
        <>
          <p className="mb-1 text-sm font-bold">Installer CEO Summit</p>
          <p className="text-xs text-white/70">
            Appuyez sur <Share className="mx-1 inline h-3.5 w-3.5" /> puis{" "}
            <strong>« Sur l&apos;écran d&apos;accueil »</strong> pour un accès plus rapide.
          </p>
        </>
      ) : (
        <>
          <p className="mb-1 text-sm font-bold">Installer CEO Summit</p>
          <p className="mb-3 text-xs text-white/70">
            Ajoutez l&apos;application à votre écran d&apos;accueil pour un accès plus rapide.
          </p>
          <Button size="sm" onClick={handleInstall} className="w-full justify-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Installer
          </Button>
        </>
      )}
    </div>
  );
}
