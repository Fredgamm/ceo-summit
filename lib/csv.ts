/** Minimal RFC 4180-ish CSV builder — E3-T04 "Export liste inscrits CSV". */
export function toCsv(rows: string[][], separator = ","): string {
  return rows
    .map((row) => row.map((field) => escapeCsvField(field, separator)).join(separator))
    .join("\r\n");
}

/**
 * Rapport QA du 7 oct. 2026 (§4.2) — CSV lisible tel quel par Excel en
 * français : marqueur UTF-8 (BOM) pour les accents et « € », point-virgule
 * comme séparateur (séparateur de liste par défaut d'Excel FR). Sans eux,
 * tout s'affichait dans la colonne A avec des caractères corrompus.
 */
export function toExcelCsv(rows: string[][]): string {
  return `﻿${toCsv(rows, ";")}`;
}

/** Nombre décimal au format français, pour qu'Excel le lise comme un nombre : "750.00" → "750,00". */
export function excelDecimal(value: string): string {
  return /^-?\d+\.\d+$/.test(value) ? value.replace(".", ",") : value;
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
const PLAIN_NUMBER = /^-?\d+([.,]\d+)?$/;

function escapeCsvField(field: string, separator: string): string {
  const safe = FORMULA_TRIGGER.test(field) && !PLAIN_NUMBER.test(field) ? `'${field}` : field;
  if (/["\r\n]/.test(safe) || safe.includes(separator)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
