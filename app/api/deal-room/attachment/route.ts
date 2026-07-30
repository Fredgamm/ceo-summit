import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { uploadPrivateObject } from "@/lib/r2";
import {
  OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES,
  OPPORTUNITY_ATTACHMENT_MAX_BYTES,
} from "@/lib/validations/opportunity";

/**
 * POST /api/deal-room/attachment — E6-T03 "documents joints (R2, PDF 10Mo
 * max)". Any authenticated member can upload while composing their
 * opportunity — no admin gate here, unlike the event banner/image routes.
 *
 * B4 (audit du 29 juillet 2026) — returns the R2 key, not a public URL:
 * Deal Room attachments are tier-gated content, so they must be resolved to
 * a short-lived signed URL at render time (see app/deal-room/[id]/page.tsx),
 * not exposed as a permanent public link.
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
  const key = `deal-room/${session.user.id}/${randomUUID()}-${sanitizeFilename(file.name)}`;
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
