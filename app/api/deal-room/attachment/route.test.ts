import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  uploadObject: vi.fn().mockResolvedValue("https://cdn.example.com/deal-room/x/doc.pdf"),
}));

import { auth } from "@/auth";
import { uploadObject } from "@/lib/r2";
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

  it("uploads a valid PDF to the documents bucket", async () => {
    const file = new File(["%PDF"], "cahier-des-charges.pdf", { type: "application/pdf" });

    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe("https://cdn.example.com/deal-room/x/doc.pdf");
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" })
    );
  });
});
