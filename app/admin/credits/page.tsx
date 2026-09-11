import { redirect } from "next/navigation";

/**
 * Retiré du parcours actif (sept. 2026) — plus aucun lien de l'app ne mène
 * ici depuis qu'acheter des crédits ne débloque plus rien (voir
 * app/credits/acheter/page.tsx). Redirection plutôt que suppression, même
 * logique que le reste du système de crédits.
 *
 * `force-dynamic` : sans appel à une API dynamique, Next.js essaie de
 * pré-générer cette page au build — `redirect()` y échoue silencieusement
 * (sert la page d'erreur interne `__next_error__` au lieu d'un vrai 307),
 * voir app/credits/acheter/page.tsx.
 */
export const dynamic = "force-dynamic";

export default function AdminCreditsPage() {
  redirect("/admin");
}
