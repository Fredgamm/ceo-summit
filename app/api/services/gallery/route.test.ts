import { beforeEach, describe, expect, it, vi } from "vitest";

const { sharpMock } = vi.hoisted(() => {
  const chain = {
    resize: vi.fn(),
    jpeg: vi.fn(),
    toBuffer: vi.fn(async () => Buffer.from("resized-bytes")),
  };
  chain.resize.mockReturnValue(chain);
  chain.jpeg.mockReturnValue(chain);
  return { sharpMock: vi.fn(() => chain) };
});

vi.mock("sharp", () => ({ default: sharpMock }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  uploadObject: vi.fn().mockResolvedValue("https://cdn.example.com/services/x/photo.jpg"),
}));
vi.mock("@/lib/upload-rate-limit", () => ({ checkUploadRateLimit: vi.fn() }));

import { auth } from "@/auth";
import { uploadObject } from "@/lib/r2";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import { POST } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeRequest(file: File | null) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost/api/services/gallery", { method: "POST", body: formData });
}

describe("POST /api/services/gallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(checkUploadRateLimit).mockResolvedValue(null);
  });

  it("rejects a request past the per-user upload rate limit", async () => {
    vi.mocked(checkUploadRateLimit).mockResolvedValue(
      Response.json({ error: "Trop de téléversements." }, { status: 429 }) as never
    );
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(429);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported file type", async () => {
    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(422);
  });

  it("rejects a file over the 5MB limit", async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    const res = await POST(makeRequest(oversized));
    expect(res.status).toBe(422);
  });

  it("resizes and uploads a valid image", async () => {
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe("https://cdn.example.com/services/x/photo.jpg");
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/jpeg" })
    );
  });
});
