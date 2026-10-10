"use client";

import * as React from "react";

/**
 * Installation de l'application (PWA) — source unique partagée par la
 * bannière (InstallPrompt) et les entrées de menu (InstallAppButton).
 *
 * Le navigateur n'émet `beforeinstallprompt` qu'une fois par chargement, et
 * son `prompt()` n'est utilisable qu'une fois : l'événement est donc capté ici,
 * dès le chargement du module (avant l'hydratation React), et partagé.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "other";

interface PwaInstallState {
  /** Déjà ouverte comme application installée. */
  installed: boolean;
  /** Le navigateur peut ouvrir sa fenêtre d'installation. */
  canPrompt: boolean;
  platform: Platform;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

const SERVER_STATE: PwaInstallState = { installed: true, canPrompt: false, platform: "other" };
let snapshot: PwaInstallState = SERVER_STATE;

function getSnapshot(): PwaInstallState {
  const next: PwaInstallState = {
    installed: installedNow || isStandalone(),
    canPrompt: deferred !== null,
    platform: isIos() ? "ios" : "other",
  };
  if (
    next.installed !== snapshot.installed ||
    next.canPrompt !== snapshot.canPrompt ||
    next.platform !== snapshot.platform
  ) {
    snapshot = next;
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** État d'installation ; côté serveur, considéré comme installé (rien n'est affiché). */
export function usePwaInstall(): PwaInstallState {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

/** Ouvre la fenêtre d'installation du navigateur, si elle est disponible. */
export async function promptPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const event = deferred;
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    installedNow = true;
    emit();
  }
  return outcome;
}
