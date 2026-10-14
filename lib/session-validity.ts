/**
 * 14 oct. 2026 — sortie de lib/require-viewer.ts pour être aussi utilisée par
 * le callback `jwt` d'auth.ts (qui ne peut pas importer require-viewer.ts,
 * lui-même dépendant d'auth.ts).
 */
/**
 * Règle partagée par `requireViewer()`, le callback `jwt` d'auth.ts et les points d'entrée qui relisent
 * eux-mêmes l'utilisateur (ex. app/api/socket/token/route.ts) : compte
 * `ACTIVE`, et session ouverte après le dernier changement de mot de passe.
 *
 * Audit sécurité (25 septembre 2026) — une réinitialisation de mot de passe
 * (compte compromis) ne révoquait aucune session JWT déjà ouverte (24h).
 * `loginAt` (auth.config.ts) est absent des JWT émis avant ce correctif :
 * dans ce cas, toute date de changement de mot de passe (forcément
 * postérieure, le champ n'existant pas avant) invalide la session.
 */
export function isViewerSessionValid(
  user: { status: string; passwordChangedAt?: Date | null },
  loginAt: number | null | undefined
): boolean {
  if (user.status !== "ACTIVE") return false;
  if (user.passwordChangedAt) {
    if (loginAt == null) return false;
    if (user.passwordChangedAt.getTime() > loginAt) return false;
  }
  return true;
}
