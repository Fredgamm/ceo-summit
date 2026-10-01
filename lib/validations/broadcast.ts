/**
 * Rapport QA du 1er oct. 2026 (§3.2a) — pièces jointes sur un broadcast,
 * mêmes limites que les autres uploads du projet (salles, services).
 */
export const BROADCAST_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const BROADCAST_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
export const BROADCAST_ATTACHMENT_MAX_COUNT = 3;
/** Durée de validité du lien signé inséré dans l'email — un destinataire peut l'ouvrir plusieurs jours après l'envoi, contrairement à un usage "vu tout de suite" (chat, aperçu). */
export const BROADCAST_ATTACHMENT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
