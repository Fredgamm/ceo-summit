import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { requireViewer } from "@/lib/require-viewer";
import { uploadPrivateObject } from "@/lib/r2";
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
  if (!COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (image ou PDF)." }, { status: 422 });
  }
  if (file.size > COMPANY_PAYMENT_PROOF_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)." }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `company-payments/${viewer.id}/${randomUUID()}-${sanitizeFilename(file.name)}`;
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
