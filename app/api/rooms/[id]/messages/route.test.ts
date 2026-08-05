import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    roomMessage: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/r2", () => ({
  getSignedDownloadUrl: vi
    .fn()
    .mockResolvedValue("https://signed.example.com/salles/room_1/doc.pdf"),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeRequest(before?: string) {
  const url = before
    ? `http://localhost/api/rooms/room_1/messages?before=${before}`
    : "http://localhost/api/rooms/room_1/messages";
  return new Request(url);
}

describe("GET /api/rooms/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
    vi.mocked(prisma.roomMessage.findMany).mockResolvedValue([
      { id: "msg_2", createdAt: new Date("2026-01-02") },
      { id: "msg_1", createdAt: new Date("2026-01-01") },
    ] as never);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeRequest(), { params: { id: "room_1" } });
    expect(res.status).toBe(401);
  });

  it("rejects a viewer whose tier can't access the room", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "CHAIRMAN_ONLY",
    } as never);
    const res = await GET(makeRequest(), { params: { id: "room_1" } });
    expect(res.status).toBe(403);
  });

  it("returns the most recent page in chronological order", async () => {
    const res = await GET(makeRequest(), { params: { id: "room_1" } });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.map((m: { id: string }) => m.id)).toEqual(["msg_1", "msg_2"]);
  });

  it("paginates before a given message's createdAt", async () => {
    vi.mocked(prisma.roomMessage.findFirst).mockResolvedValue({
      id: "msg_2",
      createdAt: new Date("2026-01-02"),
    } as never);

    await GET(makeRequest("msg_2"), { params: { id: "room_1" } });

    expect(prisma.roomMessage.findFirst).toHaveBeenCalledWith({
      where: { id: "msg_2", roomId: "room_1" },
    });
    expect(prisma.roomMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: new Date("2026-01-02") } }),
      })
    );
  });

  it("resolves an attachmentKey to a signed URL, never a raw key", async () => {
    vi.mocked(prisma.roomMessage.findMany).mockResolvedValue([
      { id: "msg_1", createdAt: new Date("2026-01-01"), attachmentKey: "salles/room_1/doc.pdf" },
    ] as never);

    const res = await GET(makeRequest(), { params: { id: "room_1" } });
    const json = await res.json();

    expect(json.data[0].attachmentUrl).not.toBe("salles/room_1/doc.pdf");
    expect(json.data[0].attachmentKey).toBeUndefined();
  });
});
