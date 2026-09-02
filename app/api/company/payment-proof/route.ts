import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { uploadPrivateObject } from "@/lib/r2";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import {
  COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES,
  COMPANY_PAYMENT_PROOF_MAX_BYTES,
} from "@/lib/validations/company-payment";

/**
 * POST /api/company/payment-proof — Phase 2 offres/paiement (30 juillet
 * 2026). Même pattern que app/api/deal-room/attachment/route.ts : upload
 * privé R2, retourne la clé (pas une URL publique) — un admin la résout en
 * URL signée au moment de la revue (app/actions/admin-companies.ts).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const rateLimited = await checkUploadRateLimit(session.user.id);
  if (rateLimited) return rateLimited;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (image ou PDF)." }, { status: 422 });
  }
  if (file.size > COMPANY_PAYMENT_PROOF_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)." }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `company-payments/${session.user.id}/${randomUUID()}-${sanitizeFilename(file.name)}`;
  await uploadPrivateObject({
    bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
    key,
    body: buffer,
    contentType: file.type,
  });

  return NextResponse.json({ data: { key, name: file.name } }, { status: 200 });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}
