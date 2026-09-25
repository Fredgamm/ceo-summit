import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 client (S3-compatible API). Ref: CEO_Summit_Architecture_Technique.docx
 *   "Stockage fichiers — Cloudflare R2 (S3-compatible)"
 * Lazily instantiated like lib/resend.ts, for the same reason: don't crash at
 * import time in environments without R2 credentials set.
 */
let client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  );
}

function getR2Client(): S3Client {
  if (!client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 credentials are not set — see .env.example");
    }
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

/**
 * Repli disque : actif dès que R2 n'est pas configuré, en dev comme en
 * prod. Introduit pour le dev local (sans lui, tout upload échouait
 * silencieusement sans compte R2 de dev), et volontairement réutilisé tel
 * quel pour le premier déploiement prod (9 sept 2026) — R2 pas encore
 * configuré (voir DEPLOY.md), un seul VPS/domaine, pas encore de vrai
 * besoin de CDN. Écrit sur disque hors de `public/` (fichiers "privés"
 * comme publics) et sert via /api/dev/local-storage — le nom garde le
 * préfixe "dev" par cohérence avec le code existant, mais la route répond
 * tant que R2 n'est pas configuré, pas seulement en développement (voir ce
 * fichier). Monté sur un volume Docker nommé en prod (docker-compose.prod.yml)
 * pour survivre aux redéploiements — à remplacer par R2 avant que le volume
 * de fichiers ne devienne un vrai problème d'échelle/CDN/backup.
 */
const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".local-storage");

async function writeLocalObject(bucket: string, key: string, body: Buffer, contentType: string) {
  const dir = path.join(LOCAL_STORAGE_DIR, bucket, path.dirname(key));
  await mkdir(dir, { recursive: true });
  const filePath = path.join(LOCAL_STORAGE_DIR, bucket, key);
  await writeFile(filePath, body);
  await writeFile(`${filePath}.contenttype`, contentType, "utf-8");
}

function localObjectUrl(bucket: string, key: string): string {
  return `/api/dev/local-storage/${bucket}/${key}`;
}

interface UploadObjectArgs {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Uploads a buffer to R2 and returns its public URL (R2_PUBLIC_URL + key).
 * Bucket public access is configured on the Cloudflare side (custom domain),
 * not per-object ACLs — R2's S3-compat API doesn't support ACL the way S3 does.
 */
export async function uploadObject({
  bucket,
  key,
  body,
  contentType,
}: UploadObjectArgs): Promise<string> {
  if (!isR2Configured()) {
    await writeLocalObject(bucket, key, body, contentType);
    return localObjectUrl(bucket, key);
  }

  const publicBaseUrl = process.env.R2_PUBLIC_URL;
  if (!publicBaseUrl) {
    throw new Error("R2_PUBLIC_URL is not set — see .env.example");
  }

  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );

  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

interface UploadPrivateObjectArgs {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * B4 (audit sécurité/RGPD du 29 juillet 2026) — for content that must stay
 * access-controlled (Deal Room attachments, room chat attachments): unlike
 * `uploadObject`, this never returns a public URL — only the R2 key, which
 * is meaningless without a signed URL generated via `getSignedDownloadUrl`
 * at render time, after the caller's own authorization check has already
 * run. Requires the target bucket to NOT have public access configured on
 * the Cloudflare side (a manual dashboard change this code cannot make).
 */
export async function uploadPrivateObject({
  bucket,
  key,
  body,
  contentType,
}: UploadPrivateObjectArgs): Promise<{ key: string }> {
  if (!isR2Configured()) {
    await writeLocalObject(bucket, key, body, contentType);
    return { key };
  }

  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
  return { key };
}

/**
 * Generates a short-lived, signed GET URL for a private object. Call this
 * only after verifying the requesting user is actually allowed to see the
 * resource (tier, ownership, room membership...) — the signature itself
 * carries no authorization, just an expiry.
 */
export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (!isR2Configured()) {
    return localObjectUrl(bucket, key);
  }

  const r2 = getR2Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}

/**
 * Audit sécurité (25 septembre 2026) — vérifie qu'une clé fournie par le
 * client (pièce jointe Deal Room, preuve de paiement...) a bien été produite
 * par la route d'upload pour CET utilisateur : ces routes préfixent toujours
 * leurs clés par `<usage>/<userId>/`. Rejette aussi tout segment `.`/`..`
 * ou vide — une clé R2 les garde littéralement, mais le repli disque
 * (`path.join`) et les navigateurs (normalisation d'URL) les résolvent, ce
 * qui permettrait de sortir du préfixe vérifié.
 */
export function isKeyUnderPrefix(key: unknown, prefix: string): boolean {
  if (typeof key !== "string" || !key.startsWith(prefix)) return false;
  if (key.includes("\\")) return false;
  const rest = key.slice(prefix.length);
  return rest.length > 0 && rest.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/**
 * Pendant de `isKeyUnderPrefix` pour les objets publics (`uploadObject`), dont
 * le client ne renvoie que l'URL : accepte l'URL du repli local comme celle
 * de R2 (les deux formes peuvent coexister en base après la bascule vers R2).
 */
export function isPublicObjectUrlUnderPrefix(
  url: unknown,
  bucket: string,
  keyPrefix: string
): boolean {
  if (typeof url !== "string" || /[?#]/.test(url)) return false;
  const bases = [localObjectUrl(bucket, "")];
  const publicBaseUrl = process.env.R2_PUBLIC_URL;
  if (publicBaseUrl) bases.push(`${publicBaseUrl.replace(/\/$/, "")}/`);
  return bases.some(
    (base) => url.startsWith(base) && isKeyUnderPrefix(url.slice(base.length), keyPrefix)
  );
}
