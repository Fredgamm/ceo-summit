/**
 * Onglets défilants sur mobile (3 nov. 2026) — calculs purs de `TabsList`
 * (`components/ui/tabs.tsx`). Avec 6 onglets (Profil, Entreprise,
 * Opportunités, Services, Mes créneaux, Mes rendez-vous), les derniers sont
 * hors écran sur un téléphone et la barre de défilement est masquée : rien
 * n'indique qu'il y en a d'autres. On estompe donc le bord où la liste
 * continue, et on recentre l'onglet actif (celui d'un lien d'email, par
 * exemple) pour qu'il soit toujours visible.
 */

export interface ScrollMetrics {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

/** Où la liste continue : `start` = des onglets cachés à gauche, `end` = à droite. */
export function scrollEdges({ scrollLeft, clientWidth, scrollWidth }: ScrollMetrics) {
  return {
    start: scrollLeft > 1,
    end: scrollLeft + clientWidth < scrollWidth - 1,
  };
}

/**
 * Dégradé de masque estompant les bords où la liste continue ; `undefined`
 * quand tout tient (aucun masque, aucun effet sur ordinateur).
 */
export function fadeMask(edges: { start: boolean; end: boolean }, size = 28): string | undefined {
  if (!edges.start && !edges.end) return undefined;
  const left = edges.start ? `transparent 0, black ${size}px` : "black 0";
  const right = edges.end ? `black calc(100% - ${size}px), transparent 100%` : "black 100%";
  return `linear-gradient(to right, ${left}, ${right})`;
}

/** Défilement qui place l'onglet actif au centre, borné aux extrémités de la liste. */
export function centeredScrollLeft(input: {
  activeLeft: number;
  activeWidth: number;
  clientWidth: number;
  scrollWidth: number;
}): number {
  const centered = input.activeLeft - (input.clientWidth - input.activeWidth) / 2;
  const max = Math.max(0, input.scrollWidth - input.clientWidth);
  return Math.min(max, Math.max(0, centered));
}
