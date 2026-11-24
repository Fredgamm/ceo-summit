"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { refreshCompanyAccess } from "@/app/paiement-en-attente/actions";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 3 * 60 * 1000;
/** 24 nov. 2026 — au-delà, on propose aussi de reprendre ou de recommencer le paiement. */
const SHOW_ACTIONS_AFTER_MS = 30 * 1000;

/**
 * Retour d'Evolia : tant que la confirmation n'est pas enregistrée, la page
 * se recharge toutes les 5 secondes (3 minutes au plus) ; une fois confirmée,
 * la session est mise à jour et le gérant arrive sur la désignation de ses
 * participants.
 */
export function PaymentConfirmationWatcher({
  confirmed,
  destination,
  pendingActions,
}: {
  confirmed: boolean;
  destination: string;
  /** Choix proposés si la confirmation tarde (paiement interrompu ou refusé chez Evolia). */
  pendingActions?: React.ReactNode;
}) {
  const router = useRouter();
  const [startedAt] = React.useState(() => Date.now());
  const [timedOut, setTimedOut] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const openSpace = React.useCallback(() => {
    startTransition(() => refreshCompanyAccess(destination));
  }, [destination]);

  React.useEffect(() => {
    if (confirmed) {
      openSpace();
      return;
    }
    const timer = setInterval(() => {
      if (Date.now() - startedAt > SHOW_ACTIONS_AFTER_MS) setSlow(true);
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        setTimedOut(true);
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [confirmed, openSpace, router, startedAt]);

  if (confirmed) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-text-mid">
          Votre paiement est confirmé. Ouverture de votre espace pour désigner les participants à
          l&apos;événement…
        </p>
        <Button onClick={openSpace} disabled={pending}>
          {pending ? "Ouverture…" : "Désigner les participants"}
        </Button>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-text-mid">
          La confirmation de votre paiement prend plus de temps que prévu. Si vous avez payé, vous
          recevrez un e-mail dès qu&apos;elle nous parvient ; vous pouvez fermer cette page.
        </p>
        {pendingActions ? (
          <PendingActions>{pendingActions}</PendingActions>
        ) : (
          <Button asChild variant="outline">
            <Link href="/entreprise/paiement">Voir l&apos;état de mon paiement</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm text-text-mid">
        Nous attendons la confirmation de votre paiement par Evolia. Cela ne prend généralement que
        quelques secondes : ne fermez pas cette page.
      </p>
      {slow && pendingActions && <PendingActions>{pendingActions}</PendingActions>}
    </div>
  );
}

function PendingActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full rounded-lg border border-border p-5">
      <p className="mb-4 text-sm text-text-mid">
        Paiement interrompu ou refusé (erreur de saisie, carte refusée, délai Mobile Money dépassé)
        ? Vous pouvez le reprendre ou recommencer.
      </p>
      {children}
    </div>
  );
}
