import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { expireDueMeetings } from "@/lib/meeting-expiry";

/**
 * POST /api/webhooks/meeting-expiry — appelée toutes les 5 minutes par le
 * timer systemd de l'hôte (`deploy/meeting-expiry.sh`), jamais par un
 * navigateur. Fait expirer les demandes de rendez-vous B2B sans réponse et
 * libère leurs créneaux (module 21, lot 6).
 *
 * Sous `api/webhooks`, comme les paiements : le middleware laisse passer les
 * appels sans session. L'accès repose donc sur le secret partagé
 * `MEETING_CRON_SECRET` (en-tête `Authorization: Bearer …`). Sans secret
 * configuré, ou trop court, la route est fermée (503) plutôt qu'ouverte.
 */
const MIN_SECRET_LENGTH = 32;

function sameSecret(received: string, expected: string): boolean {
  // Hachés avant comparaison : longueurs égales pour timingSafeEqual, sans
  // révéler la longueur du secret.
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.MEETING_CRON_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ error: "Tâche non configurée." }, { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !sameSecret(token, secret)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const expired = await expireDueMeetings();
  // TODO lot 7 (emails) : « Demande expirée » aux deux participants de chaque demande.
  return NextResponse.json({ expired: expired.length });
}
