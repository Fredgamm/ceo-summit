import { beforeEach, describe, expect, it, vi } from "vitest";

const { sharpMock, sharpChain } = vi.hoisted(() => {
  const chain: {
    resize: ReturnType<typeof vi.fn>;
    jpeg: ReturnType<typeof vi.fn>;
    toBuffer: ReturnType<typeof vi.fn>;
  } = {
    resize: vi.fn(),
    jpeg: vi.fn(),
    toBuffer: vi.fn(async () => Buffer.from("resized-bytes")),
  };
  chain.resize.mockReturnValue(chain);
  chain.jpeg.mockReturnValue(chain);
  const sharpMock = vi.fn(() => chain);
  return { sharpMock, sharpChain: chain };
});

vi.mock("sharp", () => ({ default: sharpMock }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  uploadObject: vi.fn().mockResolvedValue("https://cdn.example.com/avatars/user_1/x.jpg"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn() } },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/r2";
import { POST } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeRequest(file: File | null) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost/api/profile/avatar", { method: "POST", body: formData });
}

describe("POST /api/profile/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpChain.resize.mockReturnValue(sharpChain);
    sharpChain.jpeg.mockReturnValue(sharpChain);
    sharpChain.toBuffer.mockResolvedValue(Buffer.from("resized-bytes"));
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
    } as never);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    const res = await POST(makeRequest(file));

    expect(res.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a request with no file", async () => {
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported MIME type", async () => {
    const file = new File(["bytes"], "photo.gif", { type: "image/gif" });
    const res = await POST(makeRequest(file));

    expect(res.status).toBe(422);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects a file over the 5MB limit", async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "photo.jpg", {
      type: "image/jpeg",
    });
    const res = await POST(makeRequest(oversized));

    expect(res.status).toBe(422);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("resizes to 400x400, uploads to R2, and persists avatarUrl on success", async () => {
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe("https://cdn.example.com/avatars/user_1/x.jpg");
    expect(sharpChain.resize).toHaveBeenCalledWith(400, 400, { fit: "cover" });
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/jpeg" })
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { avatarUrl: "https://cdn.example.com/avatars/user_1/x.jpg" },
    });
  });
});
