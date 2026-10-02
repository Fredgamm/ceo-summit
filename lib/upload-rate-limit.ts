import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";

/** Large pour un usage normal (galerie de plusieurs visuels, pièces jointes). */
const UPLOAD_LIMIT_PER_HOUR = 30;

/**
 * Limite commune aux routes d'upload, par utilisateur (elles sont toutes
 * authentifiées) : sans elle, n'importe quel compte pouvait les appeler en
 * boucle avec des fichiers à la taille maximale, au prix du stockage et du
 * traitement `sharp`.
 *
 * Renvoie une réponse 429 prête à retourner, ou `null` si l'upload peut
 * continuer.
 */
export async function checkUploadRateLimit(userId: string): Promise<NextResponse | null> {
  const result = await checkRateLimit(`upload:${userId}`, UPLOAD_LIMIT_PER_HOUR, 60 * 60);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Trop de téléversements. Réessayez plus tard." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
