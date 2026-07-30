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
  const sharpMock = vi.fn(() => chain);
  return { sharpMock, sharpChain: chain };
});

vi.mock("sharp", () => ({ default: vi.fn(() => sharpChain) }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique: vi.fn() } } }));
vi.mock("@/lib/r2", () => ({
  uploadObject: vi.fn().mockResolvedValue("https://cdn.example.com/events/x.jpg"),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/r2";
import { POST } from "./route";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

function makeRequest(file: File | null) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost/api/admin/events/image", { method: "POST", body: formData });
}

describe("POST /api/admin/events/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpChain.resize.mockReturnValue(sharpChain);
    sharpChain.jpeg.mockReturnValue(sharpChain);
    sharpChain.toBuffer.mockResolvedValue(Buffer.from("resized-bytes"));
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("rejects a non-admin caller", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
    const file = new File(["bytes"], "banner.jpg", { type: "image/jpeg" });

    const res = await POST(makeRequest(file));
    expect(res.status).toBe(403);
  });

  it("rejects an unsupported MIME type", async () => {
    const file = new File(["bytes"], "banner.gif", { type: "image/gif" });
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(422);
  });

  it("resizes to 1200x675 and uploads to the events bucket", async () => {
    const file = new File(["bytes"], "banner.jpg", { type: "image/jpeg" });

    const res = await POST(makeRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.url).toBe("https://cdn.example.com/events/x.jpg");
    expect(sharpChain.resize).toHaveBeenCalledWith(1200, 675, { fit: "cover" });
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/jpeg" })
    );
  });
});
