/**
 * Audit QA (22 septembre 2026) — les champs URL (site web, LinkedIn) du
 * profil membre rejetaient toute saisie sans "https://" explicite, alors que
 * la plupart des gens tapent juste "linkedin.com/in/..." ou
 * "monsite.mg". Ajoute le schéma manquant plutôt que de forcer l'utilisateur
 * à le taper lui-même.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Audit sécurité (25 septembre 2026) — garde de rendu défensive pour les
 * liens saisis par les membres (site web, LinkedIn...) : les schémas Zod
 * n'imposent un vrai `http(s)://` que depuis cette date, des valeurs déjà
 * en base peuvent donc encore contenir un `javascript:`/`data:` rendu tel
 * quel en `href`. Retourne l'URL uniquement si son protocole est http(s),
 * `null` sinon — l'appelant n'affiche alors tout simplement pas le lien.
 */
export function safeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
