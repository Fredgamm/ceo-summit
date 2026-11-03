"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { respondByEmailForm, respondByEmailToken } from "@/app/actions/meeting-email-response";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type State =
  { kind: "working" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/**
 * Module 21 lot 7 bis (3 nov. 2026) — page ouverte par les boutons « Accepter »
 * et « Décliner » de l'email de demande. La réponse s'enregistre toute seule à
 * l'ouverture, puis un simple message l'annonce (l'email de confirmation ou de
 * refus suit).
 *
 * Elle part du navigateur (action serveur appelée au chargement) et non au
 * simple affichage de la page : un antivirus ou un aperçu de messagerie qui
 * ouvre le lien sans exécuter de script ne répond donc pas à la place du
 * destinataire. Sans JavaScript, un bouton permet de confirmer.
 */
export function EmailResponse({
  token,
  choice,
  requesterName,
}: {
  token: string;
  choice: "accepter" | "decliner";
  requesterName: string;
}) {
  const [state, setState] = React.useState<State>({ kind: "working" });
  // Le mode strict de React exécute les effets deux fois en développement : une
  // seule réponse doit partir.
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    respondByEmailToken(token, choice)
      .then((result) =>
        setState(
          result.success
            ? {
                kind: "done",
                message:
                  choice === "accepter"
                    ? `Rendez-vous accepté. Un email de confirmation, avec le fichier calendrier et les coordonnées de ${requesterName}, vous est envoyé.`
                    : `Demande déclinée. ${requesterName} en sera informé(e) par email.`,
              }
            : { kind: "error", message: result.error }
        )
      )
      .catch(() =>
        setState({ kind: "error", message: "Une erreur est survenue. Réessayez dans un instant." })
      );
  }, [token, choice, requesterName]);

  if (state.kind === "working") {
    return (
      <>
        <p className="flex items-center justify-center gap-2 text-sm text-text-mid" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enregistrement de votre réponse…
        </p>
        <noscript>
          <form action={respondByEmailForm} className="mt-4">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="choix" value={choice} />
            <Button type="submit" className="w-full justify-center">
              {choice === "accepter"
                ? "Confirmer : accepter le rendez-vous"
                : "Confirmer : décliner la demande"}
            </Button>
          </form>
        </noscript>
      </>
    );
  }

  const ok = state.kind === "done";
  return (
    <>
      <Alert variant={ok ? "success" : "destructive"}>
        {ok ? <CheckCircle2 /> : <AlertTriangle />}
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
      <Button asChild variant="outline" className="mt-6 w-full justify-center">
        <Link href="/profil?onglet=mes-rendez-vous">Voir mes rendez-vous</Link>
      </Button>
    </>
  );
}
