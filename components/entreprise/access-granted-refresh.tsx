"use client";

import * as React from "react";

import { refreshCompanyAccess } from "@/app/paiement-en-attente/actions";
import { Button } from "@/components/ui/button";

/**
 * Affiché sur /paiement-en-attente quand l'abonnement est déjà actif en base
 * mais pas encore dans la session : met la session à jour automatiquement,
 * avec un bouton de secours si l'appel automatique n'aboutit pas.
 */
export function AccessGrantedRefresh() {
  const [pending, startTransition] = React.useTransition();

  const refresh = React.useCallback(() => {
    startTransition(() => refreshCompanyAccess());
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-text-mid">
        Votre paiement a été validé. Ouverture de votre espace membre…
      </p>
      <Button onClick={refresh} disabled={pending}>
        {pending ? "Ouverture…" : "Accéder à mon espace"}
      </Button>
    </div>
  );
}
