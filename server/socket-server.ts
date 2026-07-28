import http from "http";

import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { Server, type Socket } from "socket.io";

import { prisma } from "../lib/prisma";
import { meetsRoomAccess } from "../lib/rooms-query";

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

interface JoinResult {
  ok: boolean;
  error?: "not_found" | "forbidden" | "suspended";
}

interface MessagePayload {
  roomId: string;
  content: string;
  attachmentUrl?: string | null;
}

interface MessageResult {
  ok: boolean;
  error?: "not_joined" | "rate_limited" | "suspended" | "empty";
}

function broadcastPresence(io: Server, roomId: string) {
  const count = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
  io.to(roomId).emit("room:presence", { roomId, count });
}

async function handleJoin(io: Server, socket: Socket, roomId: string): Promise<JoinResult> {
  const userId = socket.data.userId as string;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== "ACTIVE") return { ok: false, error: "not_found" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  const tier = user?.memberships[0]?.tier ?? null;
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
  const { roomId, content, attachmentUrl } = payload;
  if (!socket.rooms.has(roomId)) return { ok: false, error: "not_joined" };
  if (!content?.trim() && !attachmentUrl) return { ok: false, error: "empty" };

  const now = Date.now();
  const last = (socket.data.lastMessageAt as number | undefined) ?? 0;
  if (now - last < RATE_LIMIT_MS) return { ok: false, error: "rate_limited" };

  const userId = socket.data.userId as string;
  const suspension = await prisma.roomSuspension.findFirst({
    where: { roomId, userId, suspendedUntil: { gt: new Date() } },
  });
  if (suspension) return { ok: false, error: "suspended" };

  const message = await prisma.roomMessage.create({
    data: {
      roomId,
      authorId: userId,
      content: content.trim(),
      attachmentUrl: attachmentUrl ?? null,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  socket.data.lastMessageAt = now;
  io.to(roomId).emit("room:message", message);
  return { ok: true };
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

  io.on("connection", (socket: Socket) => {
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
      (roomIds: string[], callback: (counts: Record<string, number>) => void) => {
        const counts: Record<string, number> = {};
        for (const id of roomIds) counts[id] = io.sockets.adapter.rooms.get(id)?.size ?? 0;
        callback(counts);
      }
    );

    socket.on("disconnect", () => {
      const joinedRooms = (socket.data.joinedRooms as Set<string>) ?? new Set<string>();
      for (const roomId of joinedRooms) broadcastPresence(io, roomId);
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
