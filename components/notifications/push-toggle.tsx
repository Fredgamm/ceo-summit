"use client";

import * as React from "react";
import { BellOff, BellRing } from "lucide-react";

import { sendTestPush } from "@/app/actions/push";
import { usePush } from "@/lib/push-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Activation des notifications push sur l'appareil (module 24, 4 nov. 2026),
 * en tête de la page Notifications. Invisible quand le navigateur ne sait pas
 * faire de push ou que le serveur n'a pas de clés : pas de bouton qui ne
 * marcherait pas.
 */
export function PushToggle() {
  const { availability, busy, error, enable, disable } = usePush();
  const [testMessage, setTestMessage] = React.useState<string | null>(null);

  if (
    availability === "loading" ||
    availability === "unsupported" ||
    availability === "unconfigured"
  ) {
    return null;
  }

  async function test() {
    setTestMessage(null);
    const result = await sendTestPush();
    setTestMessage(
      result.success && result.data.delivered > 0
        ? "Notification envoyée."
        : "Aucune notification n'a pu être envoyée à cet appareil."
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-light text-navy">
          {availability === "on" ? (
            <BellRing className="h-5 w-5" aria-hidden />
          ) : (
            <BellOff className="h-5 w-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-navy">
            {availability === "on"
              ? "Notifications activées sur cet appareil"
              : "Recevoir les notifications sur cet appareil"}
          </h2>
          <p className="mt-0.5 text-sm text-text-mid">
            {availability === "ios-install" &&
              "Sur iPhone, ajoutez d'abord l'application à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), ouvrez-la depuis l'écran d'accueil, puis revenez ici pour activer les notifications."}
            {availability === "denied" &&
              "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages de votre navigateur ou de votre téléphone, puis revenez ici."}
            {availability === "off" &&
              "Soyez prévenu tout de suite d'une demande de rendez-vous, d'une réponse ou d'un message, même quand l'application est fermée."}
            {availability === "on" &&
              "Vous êtes prévenu des demandes de rendez-vous, de leurs réponses et des annulations."}
          </p>
        </div>
      </div>

      {availability === "off" && (
        <Button className="h-11 w-full sm:w-auto sm:self-start" disabled={busy} onClick={enable}>
          {busy ? "Activation…" : "Activer les notifications"}
        </Button>
      )}
      {availability === "on" && (
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" className="h-11" disabled={busy} onClick={test}>
            Envoyer un test
          </Button>
          <Button variant="ghost" className="h-11" disabled={busy} onClick={disable}>
            Désactiver
          </Button>
        </div>
      )}

      {testMessage && <p className="text-sm text-text-mid">{testMessage}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
