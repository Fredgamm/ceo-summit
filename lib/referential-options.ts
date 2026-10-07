/**
 * Rapport QA du 1er oct. 2026 (§4) — les sélecteurs secteur/pays affichent
 * d'abord les 10 premières valeurs du référentiel (ordre `position`), le
 * reste se trouve par une recherche sur le catalogue complet. Aucune valeur
 * « Autre » : l'utilisateur choisit toujours une valeur prédéfinie.
 */
export const REFERENTIAL_PRIORITY_COUNT = 10;

/** Minuscules sans accents : « Éducation » et « education » se retrouvent. */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filterReferentialOptions(options: readonly string[], query: string): string[] {
  const q = normalizeForSearch(query);
  if (!q) return [...options];
  return options.filter((option) => normalizeForSearch(option).includes(q));
}

/**
 * Les valeurs prioritaires, suivies des valeurs déjà sélectionnées qui n'en
 * font pas partie (sinon une valeur trouvée par la recherche disparaîtrait
 * de l'affichage une fois choisie).
 */
export function visibleReferentialOptions(
  options: readonly string[],
  selected: readonly string[],
  priorityCount = REFERENTIAL_PRIORITY_COUNT
): string[] {
  const priority = options.slice(0, priorityCount);
  const extra = selected.filter(
    (value) => value && options.includes(value) && !priority.includes(value)
  );
  return [...priority, ...extra];
}
