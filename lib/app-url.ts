/**
 * 14 oct. 2026 — adresse publique de l'instance (prod b2b.ceo-summit.mg,
 * préprod app.ceo-summit.mg, local), lue dans la configuration plutôt
 * qu'écrite en dur : une même image sert les deux instances.
 */
export function appUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
