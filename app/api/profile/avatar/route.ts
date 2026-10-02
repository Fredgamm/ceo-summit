import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/r2";
import { requireViewer } from "@/lib/require-viewer";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
} from "@/lib/validations/profile";

/**
 * POST /api/profile/avatar — E2-T02 photo upload.
 * A route handler (not a Server Action) because it needs multipart file
 * input and returns a plain JSON response the client reads directly to
 * update the preview — a Server Action's use is better suited to form
 * field submission than binary uploads.
 *
 * Resize happens here, server-side (backlog: "redimensionnement 400x400
 * côté serveur") — the client never gets a presigned URL to upload
 * directly to R2, specifically so the resize can't be bypassed.
 */
export async function POST(req: Request) {
  // Audit sécurité (25 septembre 2026) — relit `User.status` (et la date de
  // changement de mot de passe) en base plutôt que de se fier au seul JWT.
  const viewerResult = await requireViewer();
  if (!viewerResult.success) {
    return NextResponse.json({ error: viewerResult.error }, { status: 401 });
  }
  const { viewer } = viewerResult;
  const rateLimited = await checkUploadRateLimit(viewer.id);
  if (rateLimited) return rateLimited;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }

  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté (JPG, PNG ou WEBP uniquement)." },
      { status: 422 }
    );
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)." }, { status: 422 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const resized = await sharp(inputBuffer)
    .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();

  const key = `avatars/${viewer.id}/${randomUUID()}.jpg`;
  const url = await uploadObject({
    bucket: process.env.R2_BUCKET_AVATARS ?? "ceo-summit-avatars",
    key,
    body: resized,
    contentType: "image/jpeg",
  });

  await prisma.user.update({ where: { id: viewer.id }, data: { avatarUrl: url } });

  return NextResponse.json({ data: { url } }, { status: 200 });
}
