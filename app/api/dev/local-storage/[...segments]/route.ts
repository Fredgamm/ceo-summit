import { readFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isR2Configured } from "@/lib/r2";

const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".local-storage");

/**
 * Sert les fichiers écrits par le repli local de lib/r2.ts. Répond tant que
 * R2 n'est pas configuré (dev, ou prod avant que R2 soit mis en place — voir
 * le commentaire au-dessus de LOCAL_STORAGE_DIR dans lib/r2.ts) ; une fois
 * R2 configuré, cette route redevient injoignable (404), cohérent avec
 * lib/r2.ts qui n'écrit plus localement dans ce cas.
 */
export async function GET(req: Request, { params }: { params: { segments: string[] } }) {
  if (isR2Configured()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const filePath = path.join(LOCAL_STORAGE_DIR, ...params.segments);
  if (!filePath.startsWith(LOCAL_STORAGE_DIR + path.sep)) {
    return NextResponse.json({ error: "Chemin invalide." }, { status: 400 });
  }

  try {
    const [body, contentType] = await Promise.all([
      readFile(filePath),
      readFile(`${filePath}.contenttype`, "utf-8").catch(() => "application/octet-stream"),
    ]);
    return new NextResponse(body, { headers: { "Content-Type": contentType } });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
