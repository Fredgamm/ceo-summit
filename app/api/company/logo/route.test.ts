import { beforeEach, describe, expect, it, vi } from "vitest";

const { sharpChain } = vi.hoisted(() => {
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
  return { sharpChain: chain };
});

vi.mock("sharp", () => ({ default: vi.fn(() => sharpChain) }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  uploadObject: vi.fn().mockResolvedValue("https://cdn.example.com/company-logos/x.jpg"),
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
  return new Request("http://localhost/api/company/logo", { method: "POST", body: formData });
}

describe("POST /api/company/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpChain.resize.mockReturnValue(sharpChain);
    sharpChain.jpeg.mockReturnValue(sharpChain);
    sharpChain.toBuffer.mockResolvedValue(Buffer.from("resized-bytes"));
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(checkUploadRateLimit).mockResolvedValue(null);
  });

  it("rejects a request past the per-user upload rate limit", async () => {
    vi.mocked(checkUploadRateLimit).mockResolvedValue(
      Response.json({ error: "Trop de téléversements." }, { status: 429 }) as never
    );
    const file = new File(["bytes"], "logo.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(429);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const file = new File(["bytes"], "logo.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported MIME type", async () => {
    const file = new File(["bytes"], "logo.gif", { type: "image/gif" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(422);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("resizes to 400x400 (contain, white background) and uploads to R2", async () => {
    const file = new File(["bytes"], "logo.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe("https://cdn.example.com/company-logos/x.jpg");
    expect(sharpChain.resize).toHaveBeenCalledWith(400, 400, {
      fit: "contain",
      background: "#ffffff",
    });
  });
});
