import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  uploadObject: vi.fn().mockResolvedValue("https://cdn.example.com/salles/room_1/doc.pdf"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/r2";
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
      memberships: [{ tier: "MEMBER" }],
    } as never);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });
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

  it("rejects a viewer whose tier can't access the room", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "CHAIRMAN_ONLY",
    } as never);
    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(403);
  });

  it("uploads a valid file to the documents bucket", async () => {
    const file = new File(["bytes"], "etude.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe("https://cdn.example.com/salles/room_1/doc.pdf");
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" })
    );
  });
});
