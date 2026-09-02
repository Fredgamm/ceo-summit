import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  uploadPrivateObject: vi.fn().mockResolvedValue({ key: "deal-room/user_1/doc.pdf" }),
}));
vi.mock("@/lib/upload-rate-limit", () => ({ checkUploadRateLimit: vi.fn() }));

import { auth } from "@/auth";
import { uploadPrivateObject } from "@/lib/r2";
import { checkUploadRateLimit } from "@/lib/upload-rate-limit";
import { POST } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeRequest(file: File | null) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost/api/deal-room/attachment", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/deal-room/attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(checkUploadRateLimit).mockResolvedValue(null);
  });

  it("rejects a request past the per-user upload rate limit", async () => {
    vi.mocked(checkUploadRateLimit).mockResolvedValue(
      Response.json({ error: "Trop de téléversements." }, { status: 429 }) as never
    );
    const file = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(429);
    expect(uploadPrivateObject).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const file = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });

    const res = await POST(makeRequest(file));
    expect(res.status).toBe(401);
  });

  it("rejects a non-PDF file", async () => {
    const file = new File(["bytes"], "doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const res = await POST(makeRequest(file));
    expect(res.status).toBe(422);
  });

  it("rejects a file over the 10MB limit", async () => {
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "doc.pdf", {
      type: "application/pdf",
    });

    const res = await POST(makeRequest(oversized));
    expect(res.status).toBe(422);
  });

  it("uploads a valid PDF to the documents bucket and returns its key, not a public URL", async () => {
    const file = new File(["%PDF"], "cahier-des-charges.pdf", { type: "application/pdf" });

    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.key).toMatch(/^deal-room\/user_1\/[0-9a-f-]+-cahier-des-charges\.pdf$/);
    expect(json.data.url).toBeUndefined();
    expect(uploadPrivateObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" })
    );
  });

  it("sanitizes a filename containing path traversal characters", async () => {
    const file = new File(["%PDF"], "../../etc/passwd.pdf", { type: "application/pdf" });
    await POST(makeRequest(file));

    const call = vi.mocked(uploadPrivateObject).mock.calls[0][0];
    expect(call.key).not.toContain("../");
  });
});
