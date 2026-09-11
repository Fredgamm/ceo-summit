import { redirect } from "next/navigation";

/**
 * Retiré du parcours actif (sept. 2026) — le coût en crédits du "Prendre
 * contact" Deal Room a disparu (voir components/deal-room/contact-panel.tsx),
 * donc acheter des crédits ne débloque plus rien : aucun lien de l'app ne
 * pointe ici depuis. Redirection plutôt que suppression, cohérent avec le
 * reste du système de crédits (voir lib/deal-room-settings.ts) — le code
 * reste disponible si la fonctionnalité doit être réactivée un jour.
 */
export default function BuyCreditsPage() {
  redirect("/deal-room");
}
