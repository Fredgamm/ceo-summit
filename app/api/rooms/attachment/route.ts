import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { uploadPrivateObject } from "@/lib/r2";
import { meetsRoomAccess } from "@/lib/rooms-query";
import { requireViewer } from "@/lib/require-viewer";
import { getViewerTierFromCompany } from "@/lib/plan-access";
import {
  ROOM_ATTACHMENT_MAX_BYTES,
  ROOM_ATTACHMENT_ALLOWED_MIME_TYPES,
} from "@/lib/validations/room";

/**
 * POST /api/rooms/attachment — E4-T03 "Upload fichier dans le chat (R2, 5 Mo max)".
 *
 * B4 (audit du 29 juillet 2026) — was missing a MIME whitelist entirely
 * (only size was checked) and stored `file.name` raw in the R2 key. Now
 * whitelists image/PDF types, sanitizes the filename, and returns a
 * private R2 key instead of a public URL — resolved to a short-lived
 * signed URL at render/broadcast time (server/socket-server.ts,
 * app/salles/[id]/page.tsx), matching the tier gate already enforced here.
 */
export async function POST(req: Request) {
  // Audit sécurité (25 septembre 2026) — relit `User.status` (et la date de
  // changement de mot de passe) en base plutôt que de se fier au seul JWT.
  const viewerResult = await requireViewer();
  if (!viewerResult.success) {
    return NextResponse.json({ error: viewerResult.error }, { status: 401 });
  }
  const { viewer } = viewerResult;

  const formData = await req.formData();
  const file = formData.get("file");
  const roomId = formData.get("roomId");
  if (!(file instanceof File) || typeof roomId !== "string") {
    return NextResponse.json({ error: "Fichier ou salle manquant." }, { status: 400 });
  }
  if (!ROOM_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté (image ou PDF uniquement)." },
      { status: 422 }
    );
  }
  if (file.size > ROOM_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)." }, { status: 422 });
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== "ACTIVE") {
    return NextResponse.json({ error: "Salle introuvable." }, { status: 404 });
  }
  if (!meetsRoomAccess(getViewerTierFromCompany(viewer.company), room.minTier)) {
    return NextResponse.json({ error: "Accès non autorisé à cette salle." }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `salles/${roomId}/${randomUUID()}-${sanitizeFilename(file.name)}`;
  await uploadPrivateObject({
    bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
    key,
    body: buffer,
    contentType: file.type,
  });

  return NextResponse.json({ data: { key, name: file.name } }, { status: 200 });
}

/** B4 — strips path separators/control characters so `file.name` can't inject an R2 key path (e.g. `../`). */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}
