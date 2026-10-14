import { readFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import {
  canAccessLocalStorageObject,
  classifyLocalStorageObject,
} from "@/lib/local-storage-access";
import { isR2Configured } from "@/lib/r2";
import { requireViewer } from "@/lib/require-viewer";

const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".local-storage");

/**
 * Sert les fichiers écrits par le repli local de lib/r2.ts. Répond tant que
 * R2 n'est pas configuré (dev, ou prod avant que R2 soit mis en place — voir
 * le commentaire au-dessus de LOCAL_STORAGE_DIR dans lib/r2.ts) ; une fois
 * R2 configuré, cette route redevient injoignable (404), cohérent avec
 * lib/r2.ts qui n'écrit plus localement dans ce cas.
 *
 * Audit sécurité (25 septembre 2026) — ne vérifiait qu'une session : tout
 * membre connecté lisait n'importe quel fichier privé (preuve de paiement,
 * pièce jointe Deal Room ou de salle), l'URL "signée" du repli local
 * n'étant qu'un chemin en clair. Contrôle d'accès par préfixe de clé
 * désormais (lib/local-storage-access.ts), refus par défaut ; le statut du
 * compte est relu en base (lib/require-viewer.ts).
 */
export async function GET(req: Request, props: { params: Promise<{ segments: string[] }> }) {
  const params = await props.params;
  if (isR2Configured()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const viewerResult = await requireViewer();
  if (!viewerResult.success) {
    return NextResponse.json({ error: viewerResult.error }, { status: 401 });
  }

  const filePath = path.join(LOCAL_STORAGE_DIR, ...params.segments);
  const objectKind = classifyLocalStorageObject(params.segments).kind;
  if (!filePath.startsWith(LOCAL_STORAGE_DIR + path.sep) || objectKind === "invalid") {
    return NextResponse.json({ error: "Chemin invalide." }, { status: 400 });
  }

  if (!(await canAccessLocalStorageObject(viewerResult.viewer, params.segments))) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }

  const isPublic = objectKind === "public";

  try {
    const [body, contentType] = await Promise.all([
      readFile(filePath),
      readFile(`${filePath}.contenttype`, "utf-8").catch(() => "application/octet-stream"),
    ]);
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        // Un fichier privé ne doit pas rester dans un cache partagé (proxy,
        // CDN) où il serait resservi sans repasser par ce contrôle.
        "Cache-Control": isPublic ? "private, max-age=3600" : "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
