import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/r2";
import { meetsRoomAccess } from "@/lib/rooms-query";

const ROOM_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/** POST /api/rooms/attachment — E4-T03 "Upload fichier dans le chat (R2, 5 Mo max)". */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const roomId = formData.get("roomId");
  if (!(file instanceof File) || typeof roomId !== "string") {
    return NextResponse.json({ error: "Fichier ou salle manquant." }, { status: 400 });
  }
  if (file.size > ROOM_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)." }, { status: 422 });
  }

  const [room, viewer] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
    }),
  ]);
  if (!room || room.status !== "ACTIVE") {
    return NextResponse.json({ error: "Salle introuvable." }, { status: 404 });
  }
  if (!viewer || !meetsRoomAccess(viewer.memberships[0]?.tier ?? null, room.minTier)) {
    return NextResponse.json({ error: "Accès non autorisé à cette salle." }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `salles/${roomId}/${randomUUID()}-${file.name}`;
  const url = await uploadObject({
    bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
    key,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  return NextResponse.json({ data: { url, name: file.name } }, { status: 200 });
}
