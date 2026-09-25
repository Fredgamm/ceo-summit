import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { requireViewer } from "@/lib/require-viewer";
import { uploadObject } from "@/lib/r2";
import {
  SERVICE_GALLERY_ALLOWED_MIME_TYPES,
  SERVICE_GALLERY_MAX_BYTES,
  SERVICE_GALLERY_WIDTH,
  SERVICE_GALLERY_HEIGHT,
} from "@/lib/validations/service";

/**
 * POST /api/services/gallery — E5-T03 "visuels" upload, one image per call
 * (the wizard calls this once per selected file, appending the returned URL
 * to its gallery array) — same independent-upload pattern as the event
 * banner and avatar routes.
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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!SERVICE_GALLERY_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté (JPG, PNG ou WEBP uniquement)." },
      { status: 422 }
    );
  }
  if (file.size > SERVICE_GALLERY_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)." }, { status: 422 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const resized = await sharp(inputBuffer)
    .resize(SERVICE_GALLERY_WIDTH, SERVICE_GALLERY_HEIGHT, { fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();

  const key = `services/${viewer.id}/${randomUUID()}.jpg`;
  const url = await uploadObject({
    bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
    key,
    body: resized,
    contentType: "image/jpeg",
  });

  return NextResponse.json({ data: { url } }, { status: 200 });
}
