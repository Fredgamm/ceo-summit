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
