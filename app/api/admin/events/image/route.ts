import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { uploadObject } from "@/lib/r2";
import {
  EVENT_IMAGE_ALLOWED_MIME_TYPES,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_WIDTH,
  EVENT_IMAGE_HEIGHT,
} from "@/lib/validations/event";

/**
 * POST /api/admin/events/image — E3-T05 banner upload. Uploaded independently
 * of create/update (same reasoning as /api/profile/avatar) since the event
 * may not exist yet when the admin picks an image on the "create" form; the
 * returned URL is submitted as part of the event form afterwards.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!EVENT_IMAGE_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté (JPG, PNG ou WEBP uniquement)." },
      { status: 422 }
    );
  }
  if (file.size > EVENT_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)." }, { status: 422 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const resized = await sharp(inputBuffer)
    .resize(EVENT_IMAGE_WIDTH, EVENT_IMAGE_HEIGHT, { fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();

  const key = `events/${randomUUID()}.jpg`;
  const url = await uploadObject({
    bucket: process.env.R2_BUCKET_EVENTS ?? "ceo-summit-event-assets",
    key,
    body: resized,
    contentType: "image/jpeg",
  });

  return NextResponse.json({ data: { url } }, { status: 200 });
}
