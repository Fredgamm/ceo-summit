"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import {
  addEmailResponseMessage,
  respondByEmailForm,
  respondByEmailToken,
} from "@/app/actions/meeting-email-response";
import { ACCEPT_QUICK_REPLIES, DECLINE_QUICK_REPLIES } from "@/lib/meeting-request-ui";
import { ResponseMessageField } from "@/components/meetings/response-message-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type State =
  { kind: "working" } | { kind: "done"; message: string } | { kind: "error"; message: string };

type MessageState =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/**
 * Module 21 lot 7 bis (3 nov. 2026) — page ouverte par les boutons « Accepter »
 * et « Décliner » de l'email de demande. La réponse s'enregistre toute seule à
 * l'ouverture, puis un simple message l'annonce (l'email de confirmation ou de
 * refus suit). La personne peut alors ajouter un mot facultatif pour le
 * demandeur (où se retrouver, comment la reconnaître) : déposé dans la
 * messagerie et envoyé par email.
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
  const [text, setText] = React.useState("");
  const [messageState, setMessageState] = React.useState<MessageState>({ kind: "idle" });
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

  async function sendMessage() {
    setMessageState({ kind: "sending" });
    try {
      const result = await addEmailResponseMessage(token, text);
      setMessageState(result.success ? { kind: "sent" } : { kind: "error", message: result.error });
    } catch {
      setMessageState({ kind: "error", message: "Une erreur est survenue. Réessayez." });
    }
  }

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

      {ok && (
        <section className="mt-5 rounded-xl border border-navy/20 bg-navy-light/40 p-4">
          {messageState.kind === "sent" ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Message envoyé à {requesterName}.
            </p>
          ) : (
            <>
              <h2 className="mb-1 text-sm font-bold text-navy">
                Laisser un mot à {requesterName} ?
              </h2>
              <p className="mb-3 text-xs text-text-muted">
                Facultatif.{" "}
                {choice === "accepter"
                  ? "Dites où vous retrouver, comment vous reconnaître…"
                  : "Vous pouvez expliquer pourquoi."}
              </p>
              <ResponseMessageField
                id="email-response-message"
                replies={choice === "accepter" ? ACCEPT_QUICK_REPLIES : DECLINE_QUICK_REPLIES}
                value={text}
                onChange={setText}
                disabled={messageState.kind === "sending"}
              />
              {messageState.kind === "error" && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{messageState.message}</AlertDescription>
                </Alert>
              )}
              <Button
                className="mt-3 w-full justify-center"
                onClick={sendMessage}
                disabled={messageState.kind === "sending" || text.trim() === ""}
              >
                {messageState.kind === "sending" ? "Envoi…" : "Envoyer le message"}
              </Button>
            </>
          )}
        </section>
      )}

      <Button asChild variant="outline" className="mt-6 w-full justify-center">
        <Link href="/profil?onglet=mes-rendez-vous">Voir mes rendez-vous</Link>
      </Button>
    </>
  );
}
