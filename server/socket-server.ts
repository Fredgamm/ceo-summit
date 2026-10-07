import http from "http";

import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { Server, type Socket } from "socket.io";

import { prisma } from "../lib/prisma";
import { meetsRoomAccess } from "../lib/rooms-query";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "../lib/plan-access";
import { encryptMessageContent } from "../lib/message-crypto";
import { getSignedDownloadUrl } from "../lib/r2";
import { CHAT_MESSAGE_MAX_LENGTH } from "../lib/validations/message";
import { scheduleOfflineEmailCheck } from "./offline-message-notifier";

/**
 * E4-T01 — standalone Socket.io server (not a Next.js custom server: keeps
 * `next dev`/`next build` untouched, matches the backlog's "custom server
 * OR NestJS microservice" alternative). Run alongside `npm run dev` via
 * `npm run socket:dev`. Auth: browser fetches a short-lived JWT from
 * `/api/socket/token` (signed with NEXTAUTH_SECRET) and passes it as
 * `socket.handshake.auth.token` — this process never touches session cookies.
 *
 * Scaling: `@socket.io/redis-adapter` fans messages out across instances via
 * Redis Pub/Sub (backlog requirement) when REDIS_URL is set; falls back to
 * the in-memory adapter for a single dev instance, same lazy pattern as
 * lib/redis.ts elsewhere in the app.
 */

const RATE_LIMIT_MS = 1000;

/**
 * Audit sécurité (25 septembre 2026) — bornes des requêtes de présence :
 * `users:presence`/`rooms:presence` acceptaient une liste d'ids de taille
 * arbitraire (sondage massif de qui est en ligne, coût mémoire/CPU).
 */
const PRESENCE_MAX_IDS = 100;

/**
 * Audit sécurité (25 septembre 2026) — le token socket (5 min, émis par
 * /api/socket/token après relecture du statut) ne suffit pas : une
 * connexion ouverte peut durer des heures après une suspension/exclusion
 * (`suspendMember`/`excludeMember` ne touchent que `User.status`). Relu en
 * base à chaque `room:join`/`conversation:join` et à chaque message.
 */
async function isActiveUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  return user?.status === "ACTIVE";
}

function boundedIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string").slice(0, PRESENCE_MAX_IDS);
}

interface JoinResult {
  ok: boolean;
  error?: "not_found" | "forbidden" | "suspended";
}

interface MessagePayload {
  roomId: string;
  content: string;
  attachmentKey?: string | null;
}

interface MessageResult {
  ok: boolean;
  error?:
    | "not_joined"
    | "rate_limited"
    | "suspended"
    | "empty"
    | "too_long"
    | "invalid_attachment"
    | "forbidden";
}

function broadcastPresence(io: Server, roomId: string) {
  const count = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
  io.to(roomId).emit("room:presence", { roomId, count });
}

async function handleJoin(io: Server, socket: Socket, roomId: string): Promise<JoinResult> {
  const userId = socket.data.userId as string;
  if (typeof roomId !== "string" || !roomId) return { ok: false, error: "not_found" };

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== "ACTIVE") return { ok: false, error: "not_found" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!user || user.status !== "ACTIVE") return { ok: false, error: "forbidden" };
  const tier = getViewerTierFromCompany(user.company);
  if (!meetsRoomAccess(tier, room.minTier)) return { ok: false, error: "forbidden" };

  const suspension = await prisma.roomSuspension.findFirst({
    where: { roomId, userId, suspendedUntil: { gt: new Date() } },
  });
  if (suspension) return { ok: false, error: "suspended" };

  socket.join(roomId);
  const joinedRooms = (socket.data.joinedRooms as Set<string>) ?? new Set<string>();
  joinedRooms.add(roomId);
  socket.data.joinedRooms = joinedRooms;

  broadcastPresence(io, roomId);
  return { ok: true };
}

async function handleMessage(
  io: Server,
  socket: Socket,
  payload: MessagePayload
): Promise<MessageResult> {
  const { roomId, attachmentKey } = payload ?? {};
  const content = typeof payload?.content === "string" ? payload.content : "";
  if (typeof roomId !== "string" || !socket.rooms.has(roomId)) {
    return { ok: false, error: "not_joined" };
  }
  if (!content.trim() && !attachmentKey) return { ok: false, error: "empty" };
  if (content.length > CHAT_MESSAGE_MAX_LENGTH) return { ok: false, error: "too_long" };
  /**
   * Correctif (7 août 2026, audit) — `attachmentKey` venait tel quel du
   * payload Socket.io brut, sans aucune vérification qu'il provient bien
   * d'un upload réel pour CETTE salle (cette vérification n'existait que
   * dans la route HTTP d'upload, `app/api/rooms/attachment/route.ts`, que
   * le protocole Socket.io contourne entièrement). Le serveur résolvait
   * ensuite n'importe quelle clé fournie en URL signée et la diffusait à
   * toute la salle — `getSignedDownloadUrl` (lib/r2.ts) documente
   * explicitement ne porter aucune autorisation, l'appelant doit vérifier
   * avant. La route d'upload préfixe toujours ses clés par
   * `salles/<roomId>/` : seul ce préfixe pour la salle courante est
   * désormais accepté, ce qui empêche de faire résoudre par le serveur une
   * clé d'une autre salle ou d'un tout autre usage du bucket (preuve de
   * paiement, pièce jointe Deal Room...).
   */
  if (
    attachmentKey != null &&
    (typeof attachmentKey !== "string" || !attachmentKey.startsWith(`salles/${roomId}/`))
  ) {
    return { ok: false, error: "invalid_attachment" };
  }

  const now = Date.now();
  const last = (socket.data.lastMessageAt as number | undefined) ?? 0;
  if (now - last < RATE_LIMIT_MS) return { ok: false, error: "rate_limited" };

  const userId = socket.data.userId as string;
  if (!(await isActiveUser(userId))) return { ok: false, error: "forbidden" };
  const suspension = await prisma.roomSuspension.findFirst({
    where: { roomId, userId, suspendedUntil: { gt: new Date() } },
  });
  if (suspension) return { ok: false, error: "suspended" };

  const message = await prisma.roomMessage.create({
    data: {
      roomId,
      authorId: userId,
      content: content.trim(),
      attachmentKey: attachmentKey ?? null,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  socket.data.lastMessageAt = now;
  // B4 — the DB only ever stores the private R2 key; broadcast a
  // short-lived signed URL instead so clients can render `href` directly
  // without needing their own signing round-trip.
  const attachmentUrl = message.attachmentKey
    ? await getSignedDownloadUrl(
        process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
        message.attachmentKey
      )
    : null;
  io.to(roomId).emit("room:message", { ...message, attachmentUrl });
  return { ok: true };
}

interface ConversationJoinResult {
  ok: boolean;
  error?: "forbidden";
}

interface ConversationMessagePayload {
  conversationId: string;
  content: string;
}

interface ConversationMessageResult {
  ok: boolean;
  error?: "not_joined" | "rate_limited" | "empty" | "too_long" | "forbidden";
}

function conversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}

async function handleConversationJoin(
  socket: Socket,
  conversationId: string
): Promise<ConversationJoinResult> {
  const userId = socket.data.userId as string;
  if (typeof conversationId !== "string") return { ok: false, error: "forbidden" };
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || (conversation.member1Id !== userId && conversation.member2Id !== userId)) {
    return { ok: false, error: "forbidden" };
  }
  if (!(await isActiveUser(userId))) return { ok: false, error: "forbidden" };
  socket.join(conversationRoom(conversationId));
  return { ok: true };
}

/** E7-T02/T03 — persists (encrypted), broadcasts (plaintext, to the two participants only),
 * and schedules the 60s offline-email check (E7-T03) if the recipient has no active socket. */
async function handleConversationMessage(
  io: Server,
  connectedUsers: Map<string, Set<string>>,
  socket: Socket,
  payload: ConversationMessagePayload
): Promise<ConversationMessageResult> {
  const { conversationId } = payload ?? {};
  const content = typeof payload?.content === "string" ? payload.content : "";
  const roomName = conversationRoom(conversationId);
  if (!socket.rooms.has(roomName)) return { ok: false, error: "not_joined" };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (content.length > CHAT_MESSAGE_MAX_LENGTH) return { ok: false, error: "too_long" };

  const now = Date.now();
  const last = (socket.data.lastMessageAt as number | undefined) ?? 0;
  if (now - last < RATE_LIMIT_MS) return { ok: false, error: "rate_limited" };

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return { ok: false, error: "not_joined" };

  const senderId = socket.data.userId as string;
  const recipientId =
    conversation.member1Id === senderId ? conversation.member2Id : conversation.member1Id;

  const senderRow = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true, name: true, avatarUrl: true, status: true },
  });
  if (senderRow?.status !== "ACTIVE") return { ok: false, error: "forbidden" };
  const sender = { id: senderRow.id, name: senderRow.name, avatarUrl: senderRow.avatarUrl };

  const encrypted = await encryptMessageContent(trimmed);
  const message = await prisma.message.create({
    data: { conversationId, senderId, content: encrypted },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt },
  });

  socket.data.lastMessageAt = now;

  io.to(roomName).emit("conversation:message", {
    id: message.id,
    conversationId,
    senderId,
    content: trimmed,
    readAt: null,
    createdAt: message.createdAt,
    author: sender,
  });

  if ((connectedUsers.get(recipientId)?.size ?? 0) === 0) {
    scheduleOfflineEmailCheck(connectedUsers, {
      conversationId,
      recipientId,
      senderId,
      preview: trimmed,
    });
  }

  return { ok: true };
}

async function handleConversationRead(
  io: Server,
  socket: Socket,
  conversationId: string
): Promise<void> {
  const roomName = conversationRoom(conversationId);
  if (!socket.rooms.has(roomName)) return;

  const userId = socket.data.userId as string;
  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
  io.to(roomName).emit("conversation:read", { conversationId, readerId: userId });
}

/**
 * Audit sécurité (25 septembre 2026) — répondait pour n'importe quel nom de
 * room Socket.io fourni, y compris `conversation:<id>` (qui est dans
 * quelle conversation privée). Limité désormais aux salles thématiques ACTIVE auxquelles le
 * demandeur a accès (mêmes règles que `handleJoin`).
 */
async function handleRoomsPresence(
  io: Server,
  socket: Socket,
  roomIds: unknown
): Promise<Record<string, number>> {
  const ids = boundedIdList(roomIds);
  if (ids.length === 0) return {};

  const user = await prisma.user.findUnique({
    where: { id: socket.data.userId as string },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!user || user.status !== "ACTIVE") return {};
  const tier = getViewerTierFromCompany(user.company);

  const rooms = await prisma.room.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true, minTier: true },
  });
  const counts: Record<string, number> = {};
  for (const room of rooms) {
    if (!meetsRoomAccess(tier, room.minTier)) continue;
    counts[room.id] = io.sockets.adapter.rooms.get(room.id)?.size ?? 0;
  }
  return counts;
}

export function createSocketServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000", credentials: true },
  });

  if (process.env.REDIS_URL) {
    // Error listeners are required — without them, ioredis's own retry
    // exhaustion throws unhandled and takes the whole process down (seen
    // locally when REDIS_URL was set but Redis wasn't actually reachable).
    // A single instance keeps working via the in-memory adapter either way.
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();
    pubClient.on("error", (err) => console.error("[socket] Redis pub client error:", err.message));
    subClient.on("error", (err) => console.error("[socket] Redis sub client error:", err.message));
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const secret = process.env.NEXTAUTH_SECRET;
    if (!token || !secret) return next(new Error("unauthorized"));
    try {
      const decoded = jwt.verify(token, secret) as { sub: string };
      socket.data.userId = decoded.sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  // E7-T03 — "pas de socket connecté" presence, tracked globally (any
  // authenticated connection counts, not just one inside a specific
  // conversation room) so the offline-email check has something to test.
  const connectedUsers = new Map<string, Set<string>>();

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
    connectedUsers.get(userId)!.add(socket.id);

    socket.on("room:join", async (roomId: string, callback?: (res: JoinResult) => void) => {
      callback?.(await handleJoin(io, socket, roomId));
    });

    socket.on("room:leave", (roomId: string) => {
      socket.leave(roomId);
      broadcastPresence(io, roomId);
    });

    socket.on(
      "room:message",
      async (payload: MessagePayload, callback?: (res: MessageResult) => void) => {
        callback?.(await handleMessage(io, socket, payload));
      }
    );

    socket.on("room:typing", (roomId: string) => {
      if (socket.rooms.has(roomId))
        socket.to(roomId).emit("room:typing", { userId: socket.data.userId });
    });

    socket.on(
      "rooms:presence",
      async (roomIds: unknown, callback: (counts: Record<string, number>) => void) => {
        if (typeof callback !== "function") return;
        callback(await handleRoomsPresence(io, socket, roomIds));
      }
    );

    socket.on(
      "users:presence",
      (userIds: unknown, callback: (online: Record<string, boolean>) => void) => {
        if (typeof callback !== "function") return;
        const online: Record<string, boolean> = {};
        for (const id of boundedIdList(userIds)) {
          online[id] = (connectedUsers.get(id)?.size ?? 0) > 0;
        }
        callback(online);
      }
    );

    socket.on(
      "conversation:join",
      async (conversationId: string, callback?: (res: ConversationJoinResult) => void) => {
        callback?.(await handleConversationJoin(socket, conversationId));
      }
    );

    socket.on(
      "conversation:message",
      async (
        payload: ConversationMessagePayload,
        callback?: (res: ConversationMessageResult) => void
      ) => {
        callback?.(await handleConversationMessage(io, connectedUsers, socket, payload));
      }
    );

    socket.on("conversation:typing", (conversationId: string) => {
      const roomName = conversationRoom(conversationId);
      if (socket.rooms.has(roomName)) {
        socket.to(roomName).emit("conversation:typing", { userId: socket.data.userId });
      }
    });

    socket.on("conversation:read", (conversationId: string) => {
      void handleConversationRead(io, socket, conversationId);
    });

    socket.on("disconnect", () => {
      const joinedRooms = (socket.data.joinedRooms as Set<string>) ?? new Set<string>();
      for (const roomId of joinedRooms) broadcastPresence(io, roomId);

      connectedUsers.get(userId)?.delete(socket.id);
      if (connectedUsers.get(userId)?.size === 0) connectedUsers.delete(userId);
    });
  });

  return { io, httpServer };
}

if (require.main === module) {
  const port = Number(process.env.SOCKET_PORT ?? 3001);
  const { httpServer } = createSocketServer();
  httpServer.listen(port, () => {
    console.log(`Socket.io server listening on :${port}`);
  });
}
