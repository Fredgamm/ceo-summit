/**
 * Audit sécurité (25 septembre 2026) — longueur maximale d'un message de
 * chat (salles thématiques et messagerie privée). Aucune limite n'existait :
 * le serveur Socket.io (server/socket-server.ts) persistait et rediffusait
 * n'importe quelle taille de `content` reçue. Même limite des deux côtés —
 * le client la reprend en `maxLength` sur les champs de saisie.
 */
export const CHAT_MESSAGE_MAX_LENGTH = 4000;
