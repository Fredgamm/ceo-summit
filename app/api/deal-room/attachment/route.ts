import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { requireViewer } from "@/lib/require-viewer";
import { uploadPrivateObject } from "@/lib/r2";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import {
  OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES,
  OPPORTUNITY_ATTACHMENT_MAX_BYTES,
} from "@/lib/validations/opportunity";
import { verifiedMimeType } from "@/lib/file-signature";

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
  if (!OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (PDF uniquement)." }, { status: 422 });
  }
  if (file.size > OPPORTUNITY_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)." }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Audit sécurité du 14 oct. 2026 (M3) — type vérifié sur le contenu, pas
  // sur le Content-Type annoncé par le navigateur ; c'est lui qui est stocké.
  const mimeType = verifiedMimeType(buffer, OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES);
  if (!mimeType) {
    return NextResponse.json({ error: "Format non supporté (PDF uniquement)." }, { status: 422 });
  }
  const key = `deal-room/${viewer.id}/${randomUUID()}-${sanitizeFilename(file.name)}`;
  await uploadPrivateObject({
    bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
    key,
    body: buffer,
    contentType: mimeType,
  });

  return NextResponse.json({ data: { key, name: file.name } }, { status: 200 });
}

/** B4 — strips path separators/control characters so `file.name` can't inject an R2 key path (e.g. `../`). */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}
