/**
 * Module 21 (D17, D18 — 8 oct. 2026) — pièces jointes d'un événement, à la
 * place de la section « Intervenants » : documents téléchargeables par les
 * participants sur la fiche de l'événement (programme, plan d'accès,
 * brochure…).
 */

export const EVENT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const EVENT_ATTACHMENT_MAX_COUNT = 10;

type Signature = "pdf" | "jpeg" | "png" | "webp" | "zip" | "ole";

/** Types acceptés, par extension. Le type MIME stocké vient d'ici, jamais du navigateur. */
const TYPES: Record<string, { mime: string; label: string; signature: Signature }> = {
  pdf: { mime: "application/pdf", label: "PDF", signature: "pdf" },
  jpg: { mime: "image/jpeg", label: "Image", signature: "jpeg" },
  jpeg: { mime: "image/jpeg", label: "Image", signature: "jpeg" },
  png: { mime: "image/png", label: "Image", signature: "png" },
  webp: { mime: "image/webp", label: "Image", signature: "webp" },
  doc: { mime: "application/msword", label: "Word", signature: "ole" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
    signature: "zip",
  },
  xls: { mime: "application/vnd.ms-excel", label: "Excel", signature: "ole" },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
    signature: "zip",
  },
  ppt: { mime: "application/vnd.ms-powerpoint", label: "PowerPoint", signature: "ole" },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PowerPoint",
    signature: "zip",
  },
};

/** Valeur de l'attribut `accept` du champ fichier. */
export const EVENT_ATTACHMENT_ACCEPT = Object.keys(TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const EVENT_ATTACHMENT_TYPES_LABEL = "PDF, images (JPG, PNG, WebP), Word, Excel, PowerPoint";

function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(fileName);
  return match ? match[1].toLowerCase() : "";
}

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((b, i) => bytes[offset + i] === b);
}

function matchesSignature(bytes: Uint8Array, signature: Signature): boolean {
  switch (signature) {
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
    case "webp":
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
    case "zip": // docx, xlsx, pptx
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "ole": // doc, xls, ppt
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
}

/**
 * Type d'un fichier envoyé : extension autorisée ET contenu cohérent avec
 * elle (en-tête du fichier). `null` sinon — un fichier HTML renommé en
 * `.pdf` est refusé.
 */
export function detectAttachmentType(
  fileName: string,
  firstBytes: Uint8Array
): { mime: string; label: string } | null {
  const type = TYPES[extensionOf(fileName)];
  if (!type || !matchesSignature(firstBytes, type.signature)) return null;
  return { mime: type.mime, label: type.label };
}

/**
 * URL produite par /api/admin/events/attachment (R2 ou repli disque) : on
 * n'enregistre pas de lien arbitraire saisi dans le formulaire.
 */
export function isUploadedAttachmentUrl(url: string): boolean {
  if (!url.includes("/events/attachments/") || url.includes("..")) return false;
  if (url.startsWith("/api/dev/local-storage/")) return true;
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  return Boolean(publicBase) && url.startsWith(`${publicBase}/events/attachments/`);
}

/** « PDF », « Word »… à partir du type MIME stocké. */
export function attachmentKindLabel(mime: string): string {
  return Object.values(TYPES).find((t) => t.mime === mime)?.label ?? "Fichier";
}

export function isAttachmentMime(mime: string): boolean {
  return Object.values(TYPES).some((t) => t.mime === mime);
}

/** Nom de fichier sûr pour une clé de stockage : « Plan d'accès.pdf » → « plan-d-acces.pdf ». */
export function safeFileName(fileName: string): string {
  const ext = extensionOf(fileName);
  const base = (ext ? fileName.slice(0, -(ext.length + 1)) : fileName)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "document"}${ext ? `.${ext}` : ""}`;
}

/** « 1,2 Mo », « 350 ko ». */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} ko`;
}
