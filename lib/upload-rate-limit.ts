import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";

const UPLOAD_LIMIT_PER_HOUR = 20;

/**
 * Correctif (refactor dette technique, sept. 2026 — audit du 7 août, §1
 * "File d'upload sans limitation de débit") : aucune des 7 routes d'upload
 * (avatar, logo entreprise, pièces jointes salle/Deal Room, preuve de
 * paiement, galerie service, bannière évènement) n'avait de throttle —
 * n'importe quel appelant authentifié pouvait les marteler avec des
 * fichiers à la taille max, sans limite de coût R2/CPU `sharp()`. Ces
 * routes sont toutes déjà derrière `auth()`/`requireAdmin()`, donc la clé
 * est l'id utilisateur (pas l'IP, contrairement aux gardes-fous
 * pré-authentification de app/actions/auth.ts).
 *
 * Retourne une réponse 429 prête à renvoyer telle quelle si la limite est
 * dépassée, ou `null` si l'appel peut continuer.
 */
export async function checkUploadRateLimit(userId: string): Promise<NextResponse | null> {
  const result = await checkRateLimit(`upload:${userId}`, UPLOAD_LIMIT_PER_HOUR, 60 * 60);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Trop de téléversements. Réessayez plus tard." },
    { status: 429 }
  );
}
