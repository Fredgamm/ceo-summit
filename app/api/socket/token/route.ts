import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

import { requireViewer } from "@/lib/require-viewer";

/**
 * GET /api/socket/token — E4-T01. The Socket.io server runs as a separate
 * Node process (see server/socket-server.ts), so it can't call NextAuth's
 * `auth()` directly. The browser fetches a short-lived token here (signed
 * with the same NEXTAUTH_SECRET) and passes it as `auth.token` when
 * connecting — the socket server just verifies the signature, no session
 * cookie parsing needed on that side.
 *
 * Audit sécurité (25 septembre 2026) — n'émet plus de token pour un compte
 * suspendu/exclu (ou une session antérieure à une réinitialisation de mot
 * de passe) : la session JWT seule ne le reflétait pas (voir
 * lib/require-viewer.ts). Le serveur socket revérifie en plus le statut au
 * `room:join`/`conversation:join`, le token restant valable 5 minutes.
 */
export async function GET() {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) {
    return NextResponse.json({ error: viewerResult.error }, { status: 401 });
  }
  const { viewer } = viewerResult;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Configuration serveur manquante." }, { status: 500 });
  }

  const token = jwt.sign({ sub: viewer.id }, secret, { expiresIn: "5m" });
  return NextResponse.json({ data: { token } }, { status: 200 });
}
