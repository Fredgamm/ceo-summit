import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  uploadPrivateObject: vi.fn().mockResolvedValue({ key: "salles/room_1/doc.pdf" }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadPrivateObject } from "@/lib/r2";
import { POST } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeRequest(file: File | null, roomId: string | null = "room_1") {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (roomId) formData.append("roomId", roomId);
  return new Request("http://localhost/api/rooms/attachment", { method: "POST", body: formData });
}

describe("POST /api/rooms/attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const file = new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(401);
  });

  it("rejects a file over the 5MB limit", async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf",
    });
    const res = await POST(makeRequest(oversized));
    expect(res.status).toBe(422);
  });

  it("rejects a disallowed MIME type", async () => {
    const file = new File(["<script>alert(1)</script>"], "evil.html", { type: "text/html" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(422);
    expect(uploadPrivateObject).not.toHaveBeenCalled();
  });

  /**
   * Décision d'architecture (sept. 2026, conception/09) — accès égal pour
   * tout membre dont l'entreprise a une offre active/validée : `minTier`
   * n'est plus comparé.
   */
  it("allows upload regardless of tier vs. the room's minTier", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "CHAIRMAN_ONLY",
    } as never);
    const file = new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(200);
  });

  it("uploads a valid file to the documents bucket and returns its key, not a public URL", async () => {
    const file = new File(["%PDF-1.7"], "etude.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.key).toMatch(/^salles\/room_1\/[0-9a-f-]+-etude\.pdf$/);
    expect(json.data.url).toBeUndefined();
    expect(uploadPrivateObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" })
    );
  });

  it("sanitizes a filename containing path traversal characters", async () => {
    const file = new File(["%PDF-1.7"], "../../etc/passwd.pdf", { type: "application/pdf" });
    await POST(makeRequest(file));

    const call = vi.mocked(uploadPrivateObject).mock.calls[0][0];
    expect(call.key).not.toContain("../");
  });
});
