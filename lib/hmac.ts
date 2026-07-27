import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies an HMAC-SHA256 signature on a raw request body — used by every
 * inbound webhook (Evolia today, Zoom/Resend later).
 * Ref: CEO_Summit_Architecture_Technique.docx §Sécurité API
 *   "Webhook Evolia : vérification signature HMAC-SHA256 obligatoire avant tout traitement"
 *
 * IMPORTANT: `rawBody` must be the exact, unparsed request body string —
 * signing over a JSON.stringify() of the parsed body will not match if key
 * order or whitespace differs from what the sender signed.
 */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(signatureHeader.replace(/^sha256=/, ""), "hex");

  // Buffers must be equal length for timingSafeEqual — mismatched length is
  // itself an invalid signature, not a crash.
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}
