/** Minimal RFC 4180-ish CSV builder — E3-T04 "Export liste inscrits CSV". */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

/**
 * 25 septembre 2026 (audit MVP) — injection de formule (CSV/DDE) : un champ
 * saisi par un membre (nom, entreprise…) commençant par `=`, `+`, `-`, `@`,
 * tabulation ou retour chariot est interprété comme une formule par
 * Excel/LibreOffice à l'ouverture de l'export par un admin. Préfixe `'`
 * (recommandation OWASP) : la cellule s'affiche comme du texte. Un nombre
 * négatif pur (`-150000`) n'est pas une formule et reste intact, pour ne pas
 * transformer un montant en texte.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function escapeCsvField(field: string): string {
  const safe = FORMULA_TRIGGER.test(field) && !PLAIN_NUMBER.test(field) ? `'${field}` : field;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
