import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { uploadObject } from "@/lib/r2";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import {
  EVENT_ATTACHMENT_MAX_BYTES,
  EVENT_ATTACHMENT_TYPES_LABEL,
  detectAttachmentType,
  safeFileName,
} from "@/lib/event-attachments";

/**
 * POST /api/admin/events/attachment — module 21 D17 (8 oct. 2026). Envoi
 * d'une pièce jointe d'événement, indépendant de l'enregistrement (comme la
 * bannière, /api/admin/events/image) : l'événement peut ne pas encore
 * exister. La pièce n'est rattachée à l'événement qu'à l'enregistrement du
 * formulaire (app/actions/admin-events.ts).
 *
 * Stockée sous `events/` (préfixe public, lib/local-storage-access.ts) :
 * comme la bannière, elle est visible de tout membre connecté, sur la fiche
 * de l'événement. Le type est vérifié sur le contenu du fichier, pas sur ce
 * qu'annonce le navigateur.
 */
export async function POST(req: Request) {
  let adminId: string;
  try {
    ({ userId: adminId } = await requireAdmin("evenements"));
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  const rateLimited = await checkUploadRateLimit(adminId);
  if (rateLimited) return rateLimited;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > EVENT_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (20 Mo max)." }, { status: 422 });
  }

  const body = Buffer.from(await file.arrayBuffer());
  const type = detectAttachmentType(file.name, body.subarray(0, 16));
  if (!type) {
    return NextResponse.json(
      { error: `Format non accepté (${EVENT_ATTACHMENT_TYPES_LABEL}).` },
      { status: 422 }
    );
  }

  const fileName = safeFileName(file.name);
  const url = await uploadObject({
    bucket: process.env.R2_BUCKET_EVENTS ?? "ceo-summit-event-assets",
    key: `events/attachments/${randomUUID()}/${fileName}`,
    body,
    contentType: type.mime,
  });

  return NextResponse.json(
    { data: { url, fileName: file.name, mimeType: type.mime, sizeBytes: file.size } },
    { status: 200 }
  );
}
