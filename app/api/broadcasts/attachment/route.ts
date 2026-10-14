import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { uploadPrivateObject } from "@/lib/r2";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import {
  BROADCAST_ATTACHMENT_ALLOWED_MIME_TYPES,
  BROADCAST_ATTACHMENT_MAX_BYTES,
} from "@/lib/validations/broadcast";
import { verifiedMimeType } from "@/lib/file-signature";

/**
 * POST /api/broadcasts/attachment — rapport QA du 1er oct. 2026 (§3.2a).
 * Admin uniquement (pas un upload membre comme les salles/services) : même
 * pattern clé privée + résolution en URL signée au moment de l'envoi
 * (voir app/actions/broadcasts.ts), jamais une URL publique directe.
 */
export async function POST(req: Request) {
  let adminId: string;
  try {
    ({ userId: adminId } = await requireAdmin("communications"));
  } catch {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }
  const rateLimited = await checkUploadRateLimit(adminId);
  if (rateLimited) return rateLimited;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!BROADCAST_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté (image ou PDF uniquement)." },
      { status: 422 }
    );
  }
  if (file.size > BROADCAST_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)." }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Audit sécurité du 14 oct. 2026 (M3) — type vérifié sur le contenu, pas
  // sur le Content-Type annoncé par le navigateur ; c'est lui qui est stocké.
  const mimeType = verifiedMimeType(buffer, BROADCAST_ATTACHMENT_ALLOWED_MIME_TYPES);
  if (!mimeType) {
    return NextResponse.json(
      { error: "Format non supporté (image ou PDF uniquement)." },
      { status: 422 }
    );
  }
  const key = `broadcasts/${randomUUID()}-${sanitizeFilename(file.name)}`;
  await uploadPrivateObject({
    bucket: process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
    key,
    body: buffer,
    contentType: mimeType,
  });

  return NextResponse.json({ data: { key, name: file.name } }, { status: 200 });
}

/** Même logique que app/api/rooms/attachment/route.ts — empêche d'injecter un chemin via le nom de fichier. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}
