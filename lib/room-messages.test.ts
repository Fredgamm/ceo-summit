import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/r2", () => ({ getSignedDownloadUrl: vi.fn() }));

import { getSignedDownloadUrl } from "@/lib/r2";
import { toClientRoomMessage } from "./room-messages";

const base = { id: "msg_1", content: "Bonjour", attachmentKey: null, deletedAt: null };

describe("toClientRoomMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSignedDownloadUrl).mockImplementation(async (_bucket, key) => `signed:${key}`);
  });

  it("resolves the attachment key into a signed URL and drops the key", async () => {
    const result = await toClientRoomMessage({ ...base, attachmentKey: "salles/r1/a.pdf" });
    expect(result.attachmentUrl).toBe("signed:salles/r1/a.pdf");
    expect(result).not.toHaveProperty("attachmentKey");
  });

  it("returns a null URL when there is no attachment", async () => {
    const result = await toClientRoomMessage(base);
    expect(result.attachmentUrl).toBeNull();
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("strips the content and attachment of a moderated message", async () => {
    const deletedAt = new Date("2026-10-01T10:00:00Z");
    const result = await toClientRoomMessage({
      ...base,
      content: "Contenu modéré",
      attachmentKey: "salles/r1/a.pdf",
      deletedAt,
    });
    expect(result.content).toBe("");
    expect(result.attachmentUrl).toBeNull();
    expect(result.deletedAt).toBe(deletedAt);
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });
});
