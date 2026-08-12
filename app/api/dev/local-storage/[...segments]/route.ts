import { readFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import { auth } from "@/auth";

const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".local-storage");

/**
 * Sert les fichiers écrits par le repli local de lib/r2.ts (identifiants R2
 * absents en développement). N'existe qu'en dev — en production, R2 est
 * toujours configuré et cette route ne doit jamais être atteignable.
 */
export async function GET(req: Request, { params }: { params: { segments: string[] } }) {
  if (process.env.NODE_ENV !== "development") {
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
