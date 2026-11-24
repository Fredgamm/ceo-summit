"use client";

import * as React from "react";
import { BellRing, X } from "lucide-react";

import { usePush } from "@/lib/push-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const SNOOZED_KEY = "ceo-summit-push-prompt-snoozed-at";
/** « Plus tard » : on ne redemande pas avant 7 jours. */
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZED_KEY) ?? "0");
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Invitation à activer les notifications (module 24, 4 nov. 2026), en tête du
 * tableau de bord — la première page du membre une fois son inscription
 * terminée. Le navigateur n'autorise la demande de permission qu'après un geste
 * de la personne : on affiche donc une carte avec un bouton, jamais une
 * demande automatique.
 *
 * Elle disparaît d'elle-même quand les notifications sont activées, refusées
 * (la carte de la page Notifications explique alors comment les débloquer),
 * ou impossibles sur l'appareil. Sur iPhone dans Safari, c'est l'invitation à
 * installer l'application qui s'en charge. « Plus tard » la masque 7 jours.
 */
export function PushPrompt() {
  // Contrôle peu coûteux avant de solliciter le serveur (`usePush` l'interroge).
  const [candidate, setCandidate] = React.useState(false);
  React.useEffect(() => {
    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setCandidate(supported && Notification.permission === "default" && !snoozed());
  }, []);

  if (!candidate) return null;
  return <PushPromptCard onSnooze={() => setCandidate(false)} />;
}

function PushPromptCard({ onSnooze }: { onSnooze: () => void }) {
  const { availability, busy, error, enable } = usePush();

  if (availability !== "off") return null;

  function later() {
    try {
      localStorage.setItem(SNOOZED_KEY, String(Date.now()));
    } catch {
      // ignoré : la carte reviendra à la prochaine visite
    }
    onSnooze();
  }

  return (
    <section
      aria-label="Activer les notifications"
      className="relative mb-6 flex flex-col gap-3 rounded-lg border border-gold-light bg-gold-pale p-4 pr-10 sm:flex-row sm:items-center"
    >
      <button
        type="button"
        onClick={later}
        aria-label="Plus tard"
        className="absolute right-2 top-2 rounded-md p-1.5 text-text-muted hover:bg-white/60"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-navy">
          <BellRing className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">
            Ne manquez aucune demande de rendez-vous
          </p>
          <p className="text-sm text-text-mid">
            Activez les notifications : vous êtes prévenu tout de suite d&apos;une demande,
            d&apos;une réponse ou d&apos;un message, même application fermée.
          </p>
          {error && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button variant="ghost" className="h-11" onClick={later} disabled={busy}>
          Plus tard
        </Button>
        <Button className="h-11" onClick={enable} disabled={busy}>
          {busy ? "Activation…" : "Activer"}
        </Button>
      </div>
    </section>
  );
}
