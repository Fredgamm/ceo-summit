import { redirect } from "next/navigation";

/**
 * Retiré du parcours actif (sept. 2026) — plus aucun lien de l'app ne mène
 * ici depuis qu'acheter des crédits ne débloque plus rien (voir
 * app/credits/acheter/page.tsx). Redirection plutôt que suppression, même
 * logique que le reste du système de crédits.
 */
export default function AdminCreditsPage() {
  redirect("/admin");
}
