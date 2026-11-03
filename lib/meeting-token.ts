import { createHash } from "node:crypto";

import { generateSecureToken } from "@/lib/tokens";

/**
 * Module 21 lot 7 bis (3 nov. 2026, RG-15) — jeton des boutons « Accepter » /
 * « Décliner » de l'email de demande. Long (256 bits), propre à une demande,
 * **stocké haché** (SHA-256) : une fuite de la base ne donne aucun lien
 * utilisable. Un seul jeton par demande ; il cesse de servir dès que la
 * demande n'est plus en attente, donc une seule réponse est possible.
 */
export function newMeetingDecisionToken(): { token: string; hash: string } {
  const token = generateSecureToken();
  return { token, hash: hashMeetingToken(token) };
}

export function hashMeetingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
