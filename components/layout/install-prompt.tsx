"use client";

import * as React from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const VISIT_COUNT_KEY = "ceo-summit-visit-count";
const DISMISSED_KEY = "ceo-summit-install-dismissed";
const MIN_VISITS_BEFORE_PROMPT = 2;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

/**
 * E9-T05 — "Ajouter à l'écran d'accueil". Android/Chrome gets the native
 * `beforeinstallprompt` banner (after the 2nd visit, matching the backlog's
 * "bannière contextuelle" ask); iOS Safari never fires that event at all, so
 * it gets a static guide instead ("Partager → Sur l'écran d'accueil").
 * Dismissal and visit count persist in localStorage — no PlatformSetting
 * needed, this is purely a client-side UX nudge.
 */
export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === "1") return;

    const visits = Number(localStorage.getItem(VISIT_COUNT_KEY) ?? "0") + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(visits));
    if (visits < MIN_VISITS_BEFORE_PROMPT) return;

    setDismissed(false);

    if (isIosSafari()) {
      setShowIosGuide(true);
      return;
    }

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function handleInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    if (outcome === "accepted") dismiss();
    else setDeferredEvent(null);
  }

  if (dismissed || (!deferredEvent && !showIosGuide)) return null;

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
