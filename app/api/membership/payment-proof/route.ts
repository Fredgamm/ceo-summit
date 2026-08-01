import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { uploadPrivateObject } from "@/lib/r2";
import {
  COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES,
  COMPANY_PAYMENT_PROOF_MAX_BYTES,
} from "@/lib/validations/company-payment";

/**
 * POST /api/membership/payment-proof — Phase 2ter (1er août 2026). Même
 * pattern que app/api/company/payment-proof/route.ts (upload privé R2,
 * retourne la clé, pas une URL publique).
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
  if (!COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (image ou PDF)." }, { status: 422 });
  }
  if (file.size > COMPANY_PAYMENT_PROOF_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)." }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `membership-payments/${session.user.id}/${randomUUID()}-${sanitizeFilename(file.name)}`;
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
