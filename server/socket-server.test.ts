import type { AddressInfo } from "net";

import jwt from "jsonwebtoken";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    room: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    adminUser: { findUnique: vi.fn() },
    roomSuspension: { findFirst: vi.fn() },
    roomMessage: { create: vi.fn() },
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    message: { create: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("../lib/message-crypto", () => ({
  encryptMessageContent: vi.fn(async (plaintext: string) => Buffer.from(plaintext)),
}));
vi.mock("./offline-message-notifier", () => ({
  scheduleOfflineEmailCheck: vi.fn(),
}));
vi.mock("../lib/r2", () => ({
  getSignedDownloadUrl: vi
    .fn()
    .mockResolvedValue("https://signed.example.com/salles/room_1/doc.pdf"),
}));

import { prisma } from "../lib/prisma";
import { getSignedDownloadUrl } from "../lib/r2";
import { scheduleOfflineEmailCheck } from "./offline-message-notifier";
import { createSocketServer } from "./socket-server";

const SECRET = "test-secret";
process.env.NEXTAUTH_SECRET = SECRET;

function tokenFor(userId: string) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: "5m" });
}

let server: ReturnType<typeof createSocketServer>;
let port: number;
const clients: ClientSocket[] = [];

function connect(userId: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${port}`, { auth: { token: tokenFor(userId) } });
    clients.push(client);
    client.on("connect", () => resolve(client));
    client.on("connect_error", (err) => reject(err));
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Audit sécurité (25 septembre 2026) — le statut du compte est relu en
  // base aux joins et à chaque message : compte ACTIVE par défaut.
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ status: "ACTIVE" } as never);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);
  delete process.env.REDIS_URL;
  server = createSocketServer();
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  port = (server.httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await new Promise<void>((resolve) => server.io.close(() => resolve()));
});

describe("connection auth", () => {
  it("rejects a connection without a token", async () => {
    await expect(
      new Promise((resolve, reject) => {
        const client = ioClient(`http://localhost:${port}`, { auth: {} });
        clients.push(client);
        client.on("connect", () => resolve(undefined));
        client.on("connect_error", reject);
      })
    ).rejects.toThrow();
  });

  it("rejects a connection with an invalid token", async () => {
    await expect(
      new Promise((resolve, reject) => {
        const client = ioClient(`http://localhost:${port}`, { auth: { token: "garbage" } });
        clients.push(client);
        client.on("connect", () => resolve(undefined));
        client.on("connect_error", reject);
      })
    ).rejects.toThrow();
  });

  it("accepts a connection with a valid token", async () => {
    const client = await connect("user_1");
    expect(client.connected).toBe(true);
  });
});

describe("room:join", () => {
  it("joins a room the member's tier allows", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
    vi.mocked(prisma.roomSuspension.findFirst).mockResolvedValue(null);

    const client = await connect("user_1");
    const result = await new Promise((resolve) => client.emit("room:join", "room_1", resolve));
    expect(result).toEqual({ ok: true });
  });

  it("rejects when the room does not exist", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue(null);

    const client = await connect("user_1");
    const result = await new Promise((resolve) => client.emit("room:join", "room_x", resolve));
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  /**
   * Décision d'architecture (sept. 2026, conception/09) — accès égal pour
   * tout membre dont l'entreprise a une offre active/validée : `minTier`
   * n'est plus comparé, un membre MEMBER rejoint désormais une salle
   * CHAIRMAN_ONLY comme n'importe quelle autre.
   */
  it("lets any tier join a room regardless of minTier", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "CHAIRMAN_ONLY",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
    vi.mocked(prisma.roomSuspension.findFirst).mockResolvedValue(null);

    const client = await connect("user_1");
    const result = await new Promise((resolve) => client.emit("room:join", "room_1", resolve));
    expect(result).toEqual({ ok: true });
  });

  it("rejects a viewer with no active company access", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: null,
    } as never);

    const client = await connect("user_1");
    const result = await new Promise((resolve) => client.emit("room:join", "room_1", resolve));
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  /**
   * Audit sécurité (25 septembre 2026) — un compte suspendu/exclu après
   * l'émission du token (ou dont la connexion est restée ouverte) ne doit
   * plus pouvoir rejoindre de salle.
   */
  it("rejects a member whose account is no longer ACTIVE", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "SUSPENDED",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
    vi.mocked(prisma.roomSuspension.findFirst).mockResolvedValue(null);

    const client = await connect("user_1");
    const result = await new Promise((resolve) => client.emit("room:join", "room_1", resolve));
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("rejects a suspended member", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
    vi.mocked(prisma.roomSuspension.findFirst).mockResolvedValue({ id: "susp_1" } as never);

    const client = await connect("user_1");
    const result = await new Promise((resolve) => client.emit("room:join", "room_1", resolve));
    expect(result).toEqual({ ok: false, error: "suspended" });
  });
});

describe("room:message", () => {
  async function joinRoom(client: ClientSocket, roomId = "room_1") {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: roomId,
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
    vi.mocked(prisma.roomSuspension.findFirst).mockResolvedValue(null);
    await new Promise((resolve) => client.emit("room:join", roomId, resolve));
  }

  it("rejects a message from a socket that hasn't joined the room", async () => {
    const client = await connect("user_1");
    const result = await new Promise((resolve) =>
      client.emit("room:message", { roomId: "room_1", content: "hello" }, resolve)
    );
    expect(result).toEqual({ ok: false, error: "not_joined" });
  });

  it("persists and broadcasts a message to everyone in the room", async () => {
    const sender = await connect("user_1");
    const listener = await connect("user_2");
    await joinRoom(sender);
    await joinRoom(listener);

    vi.mocked(prisma.roomMessage.create).mockResolvedValue({
      id: "msg_1",
      roomId: "room_1",
      authorId: "user_1",
      content: "Bonjour à tous",
      attachmentKey: null,
      author: { id: "user_1", name: "Jean-Pierre", avatarUrl: null },
    } as never);

    const received = new Promise((resolve) => listener.once("room:message", resolve));
    const result = await new Promise((resolve) =>
      sender.emit("room:message", { roomId: "room_1", content: "Bonjour à tous" }, resolve)
    );

    expect(result).toEqual({ ok: true });
    expect(await received).toMatchObject({ id: "msg_1", content: "Bonjour à tous" });
    expect(prisma.roomMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: "room_1",
          authorId: "user_1",
          content: "Bonjour à tous",
        }),
      })
    );
  });

  it("resolves attachmentKey to a signed URL when broadcasting, never the raw key", async () => {
    const sender = await connect("user_1");
    const listener = await connect("user_2");
    await joinRoom(sender);
    await joinRoom(listener);

    vi.mocked(prisma.roomMessage.create).mockResolvedValue({
      id: "msg_2",
      roomId: "room_1",
      authorId: "user_1",
      content: "",
      attachmentKey: "salles/room_1/doc.pdf",
      author: { id: "user_1", name: "Jean-Pierre", avatarUrl: null },
    } as never);

    const received = new Promise((resolve) => listener.once("room:message", resolve));
    await new Promise((resolve) =>
      sender.emit(
        "room:message",
        { roomId: "room_1", content: "", attachmentKey: "salles/room_1/doc.pdf" },
        resolve
      )
    );

    expect(await received).toMatchObject({
      attachmentUrl: "https://signed.example.com/salles/room_1/doc.pdf",
    });
    expect(getSignedDownloadUrl).toHaveBeenCalledWith(expect.any(String), "salles/room_1/doc.pdf");
  });

  /**
   * Correctif (7 août 2026, audit) — `attachmentKey` était résolu en URL
   * signée sans jamais vérifier qu'il provient d'un upload réel pour cette
   * salle ; un client pouvait fournir la clé d'une autre salle (ou de tout
   * autre usage du bucket, ex. preuve de paiement) et se faire diffuser
   * une URL signée dessus.
   */
  it("rejects an attachmentKey that doesn't belong to the current room", async () => {
    const sender = await connect("user_1");
    await joinRoom(sender);

    const result = await new Promise((resolve) =>
      sender.emit(
        "room:message",
        { roomId: "room_1", content: "", attachmentKey: "salles/room_2/other.pdf" },
        resolve
      )
    );

    expect(result).toMatchObject({ ok: false, error: "invalid_attachment" });
    expect(prisma.roomMessage.create).not.toHaveBeenCalled();
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("rate-limits a second message sent within 1s", async () => {
    const client = await connect("user_1");
    await joinRoom(client);
    vi.mocked(prisma.roomMessage.create).mockResolvedValue({ id: "msg_1", author: {} } as never);

    const first = await new Promise((resolve) =>
      client.emit("room:message", { roomId: "room_1", content: "un" }, resolve)
    );
    const second = await new Promise((resolve) =>
      client.emit("room:message", { roomId: "room_1", content: "deux" }, resolve)
    );

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, error: "rate_limited" });
  });

  it("rejects a message once the account is suspended, even after joining", async () => {
    const client = await connect("user_1");
    await joinRoom(client);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ status: "SUSPENDED" } as never);

    const result = await new Promise((resolve) =>
      client.emit("room:message", { roomId: "room_1", content: "hello" }, resolve)
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(prisma.roomMessage.create).not.toHaveBeenCalled();
  });

  it("rejects a message longer than the chat limit", async () => {
    const client = await connect("user_1");
    await joinRoom(client);

    const result = await new Promise((resolve) =>
      client.emit("room:message", { roomId: "room_1", content: "a".repeat(4001) }, resolve)
    );
    expect(result).toEqual({ ok: false, error: "too_long" });
    expect(prisma.roomMessage.create).not.toHaveBeenCalled();
  });

  it("rejects an empty message with no attachment", async () => {
    const client = await connect("user_1");
    await joinRoom(client);

    const result = await new Promise((resolve) =>
      client.emit("room:message", { roomId: "room_1", content: "   " }, resolve)
    );
    expect(result).toEqual({ ok: false, error: "empty" });
  });
});

describe("conversation:join", () => {
  it("joins a conversation the socket's user is a participant of", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      member1Id: "user_1",
      member2Id: "user_2",
    } as never);

    const client = await connect("user_1");
    const result = await new Promise((resolve) =>
      client.emit("conversation:join", "conv_1", resolve)
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects a user who isn't a participant", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      member1Id: "user_1",
      member2Id: "user_2",
    } as never);

    const client = await connect("user_3");
    const result = await new Promise((resolve) =>
      client.emit("conversation:join", "conv_1", resolve)
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("rejects a participant whose account is no longer ACTIVE", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      member1Id: "user_1",
      member2Id: "user_2",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ status: "SUSPENDED" } as never);

    const client = await connect("user_1");
    const result = await new Promise((resolve) =>
      client.emit("conversation:join", "conv_1", resolve)
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("rejects a conversation that doesn't exist", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);
    const client = await connect("user_1");
    const result = await new Promise((resolve) =>
      client.emit("conversation:join", "conv_x", resolve)
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("conversation:message", () => {
  async function joinConversation(client: ClientSocket, conversationId = "conv_1") {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: conversationId,
      member1Id: "user_1",
      member2Id: "user_2",
    } as never);
    await new Promise((resolve) => client.emit("conversation:join", conversationId, resolve));
  }

  it("rejects a message from a socket that hasn't joined the conversation", async () => {
    const client = await connect("user_1");
    const result = await new Promise((resolve) =>
      client.emit("conversation:message", { conversationId: "conv_1", content: "hello" }, resolve)
    );
    expect(result).toEqual({ ok: false, error: "not_joined" });
  });

  it("encrypts, persists, and broadcasts the plaintext to both participants", async () => {
    const sender = await connect("user_1");
    const recipient = await connect("user_2");
    await joinConversation(sender);
    await joinConversation(recipient);

    vi.mocked(prisma.message.create).mockResolvedValue({
      id: "msg_1",
      conversationId: "conv_1",
      senderId: "user_1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre",
      avatarUrl: null,
      status: "ACTIVE",
    } as never);

    const received = new Promise((resolve) => recipient.once("conversation:message", resolve));
    const result = await new Promise((resolve) =>
      sender.emit(
        "conversation:message",
        { conversationId: "conv_1", content: "Bonjour Sarah" },
        resolve
      )
    );

    expect(result).toEqual({ ok: true });
    expect(await received).toMatchObject({
      id: "msg_1",
      content: "Bonjour Sarah",
      senderId: "user_1",
    });
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: "conv_1", senderId: "user_1" }),
      })
    );
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conv_1" } })
    );
  });

  it("schedules an offline-email check when the recipient has no active socket", async () => {
    const sender = await connect("user_1");
    await joinConversation(sender);
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: "msg_1",
      createdAt: new Date(),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "JP",
      status: "ACTIVE",
    } as never);

    await new Promise((resolve) =>
      sender.emit("conversation:message", { conversationId: "conv_1", content: "hello" }, resolve)
    );

    expect(scheduleOfflineEmailCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId: "conv_1",
        recipientId: "user_2",
        senderId: "user_1",
      })
    );
  });

  it("does not schedule an offline-email check when the recipient is connected", async () => {
    const sender = await connect("user_1");
    const recipient = await connect("user_2");
    await joinConversation(sender);
    await joinConversation(recipient);
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: "msg_1",
      createdAt: new Date(),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "JP",
      status: "ACTIVE",
    } as never);

    await new Promise((resolve) =>
      sender.emit("conversation:message", { conversationId: "conv_1", content: "hello" }, resolve)
    );

    expect(scheduleOfflineEmailCheck).not.toHaveBeenCalled();
  });

  it("rejects a message longer than the chat limit", async () => {
    const client = await connect("user_1");
    await joinConversation(client);
    const result = await new Promise((resolve) =>
      client.emit(
        "conversation:message",
        { conversationId: "conv_1", content: "a".repeat(4001) },
        resolve
      )
    );
    expect(result).toEqual({ ok: false, error: "too_long" });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("rejects a message from a sender suspended after joining", async () => {
    const client = await connect("user_1");
    await joinConversation(client);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "JP",
      status: "SUSPENDED",
    } as never);
    const result = await new Promise((resolve) =>
      client.emit("conversation:message", { conversationId: "conv_1", content: "hi" }, resolve)
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const client = await connect("user_1");
    await joinConversation(client);
    const result = await new Promise((resolve) =>
      client.emit("conversation:message", { conversationId: "conv_1", content: "   " }, resolve)
    );
    expect(result).toEqual({ ok: false, error: "empty" });
  });
});

describe("conversation:read", () => {
  it("marks the other participant's messages as read and broadcasts a receipt", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      member1Id: "user_1",
      member2Id: "user_2",
    } as never);

    const reader = await connect("user_2");
    const sender = await connect("user_1");
    await new Promise((resolve) => reader.emit("conversation:join", "conv_1", resolve));
    await new Promise((resolve) => sender.emit("conversation:join", "conv_1", resolve));

    const received = new Promise((resolve) => sender.once("conversation:read", resolve));
    reader.emit("conversation:read", "conv_1");

    expect(await received).toEqual({ conversationId: "conv_1", readerId: "user_2" });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { conversationId: "conv_1", senderId: { not: "user_2" }, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("users:presence", () => {
  it("reports online for connected users and offline for the rest", async () => {
    const online = await connect("user_1");
    const requester = await connect("user_3");

    const result = await new Promise((resolve) =>
      requester.emit("users:presence", ["user_1", "user_2"], resolve)
    );

    expect(result).toEqual({ user_1: true, user_2: false });
    void online;
  });

  /** Audit sécurité (25 septembre 2026) — liste d'ids bornée. */
  it("answers for at most 100 ids", async () => {
    const requester = await connect("user_3");
    const ids = Array.from({ length: 150 }, (_, i) => `user_${i}`);

    const result = (await new Promise((resolve) =>
      requester.emit("users:presence", ids, resolve)
    )) as Record<string, boolean>;

    expect(Object.keys(result)).toHaveLength(100);
  });
});

/**
 * Audit sécurité (25 septembre 2026) — `rooms:presence` répondait pour
 * n'importe quel nom de room Socket.io (y compris `conversation:<id>`).
 */
describe("rooms:presence", () => {
  it("only reports ACTIVE rooms the requester has access to", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    } as never);
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      { id: "room_1", minTier: "ALL_MEMBERS" },
    ] as never);

    const requester = await connect("user_1");
    const result = await new Promise((resolve) =>
      requester.emit("rooms:presence", ["room_1", "conversation:conv_1"], resolve)
    );

    expect(result).toEqual({ room_1: 0 });
    expect(prisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["room_1", "conversation:conv_1"] }, status: "ACTIVE" },
      })
    );
  });

  it("reports nothing to a requester without platform access", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      status: "ACTIVE",
      company: null,
    } as never);
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      { id: "room_1", minTier: "ALL_MEMBERS" },
    ] as never);

    const requester = await connect("user_1");
    const result = await new Promise((resolve) =>
      requester.emit("rooms:presence", ["room_1"], resolve)
    );

    expect(result).toEqual({});
  });
});

/**
 * Contrôle d'accès multi-points (7 août 2026) — "suivi en temps réel :
 * entrée et nombre de présence". checkin:join/scan sont admin-only ; le
 * check-in réel reste écrit par la Server Action `checkInRegistration`,
 * ce canal ne fait que rediffuser aux autres postes ouverts sur le même
 * évènement.
 */
describe("checkin:join / checkin:scan", () => {
  it("rejects checkin:join for a non-admin", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isPlatformAdmin: false,
      status: "ACTIVE",
    } as never);

    const client = await connect("user_1");
    const result = await new Promise((resolve) => client.emit("checkin:join", "evt_1", resolve));

    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  /** Audit sécurité (25 septembre 2026) — même règle que requireAdmin(). */
  it("rejects checkin:join for a deactivated admin account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isPlatformAdmin: true,
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ active: false } as never);

    const client = await connect("admin_1");
    const result = await new Promise((resolve) => client.emit("checkin:join", "evt_1", resolve));

    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("allows checkin:join for a platform admin", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isPlatformAdmin: true,
      status: "ACTIVE",
    } as never);

    const client = await connect("admin_1");
    const result = await new Promise((resolve) => client.emit("checkin:join", "evt_1", resolve));

    expect(result).toEqual({ ok: true });
  });

  it("broadcasts checkin:update to every admin joined on the same event, including the sender", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isPlatformAdmin: true,
      status: "ACTIVE",
    } as never);

    const scanner = await connect("admin_1");
    const dashboard = await connect("admin_2");
    await new Promise((resolve) => scanner.emit("checkin:join", "evt_1", resolve));
    await new Promise((resolve) => dashboard.emit("checkin:join", "evt_1", resolve));

    const receivedByDashboard = new Promise((resolve) => dashboard.once("checkin:update", resolve));
    const receivedByScanner = new Promise((resolve) => scanner.once("checkin:update", resolve));
    scanner.emit("checkin:scan", {
      eventId: "evt_1",
      checkpointId: "cp_1",
      checkpointName: "Entrée VIP",
    });

    expect(await receivedByDashboard).toMatchObject({
      checkpointId: "cp_1",
      checkpointName: "Entrée VIP",
    });
    expect(await receivedByScanner).toMatchObject({ checkpointId: "cp_1" });
  });

  it("does not broadcast a scan for an event the socket never joined", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isPlatformAdmin: true,
      status: "ACTIVE",
    } as never);

    const scanner = await connect("admin_1");
    const dashboard = await connect("admin_2");
    await new Promise((resolve) => dashboard.emit("checkin:join", "evt_1", resolve));
    // `scanner` never joins — its scan for evt_1 must be dropped, not broadcast.

    let received = false;
    dashboard.on("checkin:update", () => {
      received = true;
    });
    scanner.emit("checkin:scan", { eventId: "evt_1", checkpointId: "cp_1", checkpointName: null });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toBe(false);
  });
});
