/**
 * Audit sécurité du 14 oct. 2026 (M3) — type d'un fichier envoyé, déduit de
 * ses premiers octets (« magic bytes ») plutôt que du `Content-Type` annoncé
 * par le navigateur, que n'importe quel client peut falsifier. Couvre les
 * formats acceptés par les envois membres (pièces jointes, preuves de
 * paiement, galeries) ; les images de profil et de logo sont de toute façon
 * ré-encodées par sharp.
 */
const SIGNATURES: { mime: string; matches: (head: Uint8Array) => boolean }[] = [
  { mime: "application/pdf", matches: (h) => startsWith(h, [0x25, 0x50, 0x44, 0x46, 0x2d]) }, // %PDF-
  { mime: "image/jpeg", matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  {
    mime: "image/png",
    matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: "image/gif",
    matches: (h) => startsWith(h, [0x47, 0x49, 0x46, 0x38]) && (h[4] === 0x37 || h[4] === 0x39), // GIF87a / GIF89a
  },
  {
    mime: "image/webp",
    matches: (h) =>
      startsWith(h, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(h.subarray(8), [0x57, 0x45, 0x42, 0x50]), // RIFF....WEBP
  },
];

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);
}

/** Type réel du contenu, ou `null` si aucun format reconnu. */
export function sniffMimeType(content: Uint8Array): string | null {
  const head = content.subarray(0, 16);
  return SIGNATURES.find((s) => s.matches(head))?.mime ?? null;
}

/**
 * Type réel du fichier s'il fait partie des formats autorisés, sinon `null`.
 * C'est ce type-là qu'il faut stocker (et resservir), jamais celui annoncé.
 */
export function verifiedMimeType(content: Uint8Array, allowed: readonly string[]): string | null {
  const mime = sniffMimeType(content);
  return mime && allowed.includes(mime) ? mime : null;
}
