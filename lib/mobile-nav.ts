/**
 * Navigation mobile (3 nov. 2026) — qui est « allumé » dans les barres du haut
 * et du bas. Logique pure, testée à part.
 *
 * Barre du haut : Événements, Notifications, Profil (menu déroulant :
 * Mon profil, Mon entreprise, Installer l'application, Déconnexion).
 * Barre du bas : Accueil, Membres, Deal Room, Salles, Messages.
 */

/** Le menu « Profil » regroupe le profil et l'entreprise : il est actif sur les deux. */
export const PROFILE_MENU_PREFIXES = ["/profil", "/entreprise"] as const;

export function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProfileMenuActive(pathname: string): boolean {
  return PROFILE_MENU_PREFIXES.some((prefix) => isUnder(pathname, prefix));
}

/** `/entreprises/[id]` (fiche d'une autre entreprise) n'est pas « Mon entreprise ». */
export function isMyCompanyActive(pathname: string): boolean {
  return isUnder(pathname, "/entreprise");
}

/** « 9+ » au-delà de 9, pour tenir dans une petite pastille. */
export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}
