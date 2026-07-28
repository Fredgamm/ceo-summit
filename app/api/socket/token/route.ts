import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * GET /api/socket/token — E4-T01. The Socket.io server runs as a separate
 * Node process (see server/socket-server.ts), so it can't call NextAuth's
 * `auth()` directly. The browser fetches a short-lived token here (signed
 * with the same NEXTAUTH_SECRET) and passes it as `auth.token` when
 * connecting — the socket server just verifies the signature, no session
 * cookie parsing needed on that side.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Configuration serveur manquante." }, { status: 500 });
  }

  const token = jwt.sign({ sub: session.user.id }, secret, { expiresIn: "5m" });
  return NextResponse.json({ data: { token } }, { status: 200 });
}
