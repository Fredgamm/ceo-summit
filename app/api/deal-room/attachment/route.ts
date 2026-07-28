import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { uploadObject } from "@/lib/r2";
import {
  OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES,
  OPPORTUNITY_ATTACHMENT_MAX_BYTES,
} from "@/lib/validations/opportunity";

/**
 * POST /api/deal-room/attachment — E6-T03 "documents joints (R2, PDF 10Mo
 * max)". Any authenticated member can upload while composing their
 * opportunity — no admin gate here, unlike the event banner/image routes.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (PDF uniquement)." }, { status: 422 });
  }
  if (file.size > OPPORTUNITY_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)." }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `deal-room/${session.user.id}/${randomUUID()}-${file.name}`;
  const url = await uploadObject({
    bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
    key,
    body: buffer,
    contentType: file.type,
  });

  return NextResponse.json({ data: { url, name: file.name } }, { status: 200 });
}
