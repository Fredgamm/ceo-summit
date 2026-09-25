import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { requireViewer } from "@/lib/require-viewer";
import { uploadObject } from "@/lib/r2";
import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_BYTES } from "@/lib/validations/profile";

const LOGO_SIZE_PX = 400;

/**
 * POST /api/company/logo — parcours revu (1er août 2026). Contrairement à
 * l'upload d'avatar (app/api/profile/avatar/route.ts), ne met à jour aucune
 * ligne en base : l'entreprise n'existe pas encore au moment de l'upload
 * (choisie dans l'assistant avant la création) — le client garde l'URL
 * renvoyée en état local et la soumet avec le reste du formulaire, comme
 * pour les pièces jointes Deal Room.
 */
export async function POST(req: Request) {
  // Audit (25 septembre 2026) — `requireViewer` relit le statut en base :
  // un compte suspendu/exclu garde sa session JWT jusqu'à 24h.
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
    .resize(LOGO_SIZE_PX, LOGO_SIZE_PX, { fit: "contain", background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toBuffer();

  const key = `company-logos/${viewer.id}/${randomUUID()}.jpg`;
  const url = await uploadObject({
    bucket: process.env.R2_BUCKET_AVATARS ?? "ceo-summit-avatars",
    key,
    body: resized,
    contentType: "image/jpeg",
  });

  return NextResponse.json({ data: { url } }, { status: 200 });
}
