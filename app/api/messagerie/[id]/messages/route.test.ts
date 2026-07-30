import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findUnique: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/message-crypto", () => ({
  decryptMessages: vi.fn(async (messages: { id: string; content: Buffer }[]) =>
    messages.map((m) => ({ ...m, content: m.content.toString() }))
  ),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeRequest(before?: string) {
  const url = before
    ? `http://localhost/api/messagerie/conv_1/messages?before=${before}`
    : "http://localhost/api/messagerie/conv_1/messages";
  return new Request(url);
}

describe("GET /api/messagerie/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      member1Id: "user_1",
      member2Id: "user_2",
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { id: "msg_2", createdAt: new Date("2026-01-02"), content: Buffer.from("second") },
      { id: "msg_1", createdAt: new Date("2026-01-01"), content: Buffer.from("first") },
    ] as never);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeRequest(), { params: { id: "conv_1" } });
    expect(res.status).toBe(401);
  });

  it("rejects a viewer who isn't a participant", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      member1Id: "user_2",
      member2Id: "user_3",
    } as never);
    const res = await GET(makeRequest(), { params: { id: "conv_1" } });
    expect(res.status).toBe(403);
  });

  it("returns decrypted messages in chronological order", async () => {
    const res = await GET(makeRequest(), { params: { id: "conv_1" } });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual([
      { id: "msg_1", createdAt: expect.any(String), content: "first" },
      { id: "msg_2", createdAt: expect.any(String), content: "second" },
    ]);
  });

  it("paginates before a given message's createdAt", async () => {
    vi.mocked(prisma.message.findFirst).mockResolvedValue({
      id: "msg_2",
      createdAt: new Date("2026-01-02"),
    } as never);

    await GET(makeRequest("msg_2"), { params: { id: "conv_1" } });

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: "msg_2", conversationId: "conv_1" },
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: new Date("2026-01-02") } }),
      })
    );
  });
});
