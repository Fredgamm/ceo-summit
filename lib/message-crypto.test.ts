import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { decryptMessageContent, decryptMessages, encryptMessageContent } from "./message-crypto";

describe("message-crypto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MESSAGE_ENCRYPTION_KEY = "test-key";
  });

  it("throws if MESSAGE_ENCRYPTION_KEY is not set", async () => {
    delete process.env.MESSAGE_ENCRYPTION_KEY;
    await expect(encryptMessageContent("hello")).rejects.toThrow("MESSAGE_ENCRYPTION_KEY");
  });

  it("encrypts plaintext via pgp_sym_encrypt", async () => {
    const cipher = Buffer.from("cipher-bytes");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ encrypted: cipher }]);

    const result = await encryptMessageContent("Bonjour Rabe");
    expect(result).toBe(cipher);
  });

  it("decrypts ciphertext via pgp_sym_decrypt", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ content: "Bonjour Rabe" }]);

    const result = await decryptMessageContent(Buffer.from("cipher-bytes"));
    expect(result).toBe("Bonjour Rabe");
  });

  it("decrypts a batch of messages, preserving other fields", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ content: "premier" }])
      .mockResolvedValueOnce([{ content: "second" }]);

    const result = await decryptMessages([
      { id: "m1", content: Buffer.from("a") },
      { id: "m2", content: Buffer.from("b") },
    ]);

    expect(result).toEqual([
      { id: "m1", content: "premier" },
      { id: "m2", content: "second" },
    ]);
  });
});
