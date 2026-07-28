import { prisma } from "@/lib/prisma";

/**
 * E7-T02 — "Chiffrement au repos (pgcrypto) · déchiffrement côté serveur
 * uniquement". Message.content is stored as `bytea` ciphertext; encryption
 * and decryption both happen inside PostgreSQL via pgp_sym_encrypt/decrypt
 * (raw SQL — Prisma has no field-level crypto of its own), keyed by
 * MESSAGE_ENCRYPTION_KEY. Plaintext only ever exists in this module and in
 * whatever calls it server-side — it's never sent to the client encrypted,
 * only already-decrypted.
 */
function getEncryptionKey(): string {
  const key = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!key) throw new Error("MESSAGE_ENCRYPTION_KEY is not set — see .env.example");
  return key;
}

export async function encryptMessageContent(plaintext: string): Promise<Buffer> {
  const key = getEncryptionKey();
  const rows = await prisma.$queryRaw<{ encrypted: Buffer }[]>`
    SELECT pgp_sym_encrypt(${plaintext}, ${key}) AS encrypted
  `;
  return rows[0].encrypted;
}

export async function decryptMessageContent(ciphertext: Buffer): Promise<string> {
  const key = getEncryptionKey();
  const rows = await prisma.$queryRaw<{ content: string }[]>`
    SELECT pgp_sym_decrypt(${ciphertext}, ${key}) AS content
  `;
  return rows[0].content;
}

export async function decryptMessages<T extends { content: Buffer }>(
  messages: T[]
): Promise<(Omit<T, "content"> & { content: string })[]> {
  return Promise.all(
    messages.map(async (m) => ({ ...m, content: await decryptMessageContent(m.content) }))
  );
}
