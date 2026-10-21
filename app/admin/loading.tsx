import { Loader2 } from "lucide-react";

/**
 * 21 oct. 2026 — fallback affiché immédiatement dans le contenu de l'AdminShell
 * (le layout reste en place) pendant le rendu serveur de la page admin suivante.
 */
export default function AdminLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true">
      <Loader2 className="h-8 w-8 animate-spin text-gold" aria-hidden="true" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
