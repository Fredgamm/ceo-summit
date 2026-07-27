import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 client (S3-compatible API). Ref: CEO_Summit_Architecture_Technique.docx
 *   "Stockage fichiers — Cloudflare R2 (S3-compatible)"
 * Lazily instantiated like lib/resend.ts, for the same reason: don't crash at
 * import time in environments without R2 credentials set.
 */
let client: S3Client | null = null;

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
