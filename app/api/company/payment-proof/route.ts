import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { requireViewer } from "@/lib/require-viewer";
import { uploadPrivateObject } from "@/lib/r2";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import {
  COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES,
  COMPANY_PAYMENT_PROOF_MAX_BYTES,
} from "@/lib/validations/company-payment";
import { verifiedMimeType } from "@/lib/file-signature";

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
  const rateLimited = await checkUploadRateLimit(viewer.id);
  if (rateLimited) return rateLimited;

  // 29 oct. 2026 — toute erreur répond en JSON avec un message lisible : une
  // exception non rattrapée renvoyait une page d'erreur que le formulaire ne
  // savait pas lire, et l'entreprise ne voyait aucun message.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Envoi incomplet — réessayez avec votre fichier." },
      { status: 400 }
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Aucun fichier reçu — choisissez votre preuve." },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Ce fichier est vide." }, { status: 422 });
  }
  if (file.size > COMPANY_PAYMENT_PROOF_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Fichier trop lourd : ${COMPANY_PAYMENT_PROOF_MAX_BYTES / (1024 * 1024)} Mo maximum.`,
      },
      { status: 422 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Audit sécurité du 14 oct. 2026 (M3) — type vérifié sur le contenu, pas
  // sur le Content-Type annoncé par le navigateur ; c'est lui qui est stocké.
  // 29 oct. 2026 — c'est désormais le seul contrôle de format : le type
  // annoncé, parfois vide ou inexact (image/pjpeg…), refusait à tort des
  // fichiers valides.
  const mimeType = verifiedMimeType(buffer, COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES);
  if (!mimeType) {
    return NextResponse.json(
      {
        error:
          "Format non accepté : PDF, JPG, PNG ou WEBP uniquement (les photos iPhone HEIC ne passent pas — faites une capture d'écran).",
      },
      { status: 422 }
    );
  }
  const key = `company-payments/${viewer.id}/${randomUUID()}-${sanitizeFilename(file.name)}`;
  try {
    await uploadPrivateObject({
      bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
      key,
      body: buffer,
      contentType: mimeType,
    });
  } catch (err) {
    console.error("[payment-proof] upload failed", err);
    return NextResponse.json(
      { error: "L'enregistrement du fichier a échoué — réessayez dans quelques instants." },
      { status: 502 }
    );
  }

  return NextResponse.json({ data: { key, name: file.name } }, { status: 200 });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}
