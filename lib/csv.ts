/** Minimal RFC 4180-ish CSV builder — E3-T04 "Export liste inscrits CSV". */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

function escapeCsvField(field: string): string {
  // Neutralize formula injection: a field starting with =, +, -, or @ is
  // interpreted as a formula by Excel/Sheets on open. Prefixing with a
  // single quote forces text interpretation without changing the visible
  // value in either tool.
  const value = /^[=+\-@]/.test(field) ? `'${field}` : field;
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
