import { io, type Socket } from "socket.io-client";

/**
 * E4-T01/T03 — browser-side singleton connection to the standalone Socket.io
 * server (server/socket-server.ts). Shared across /salles and /salles/[id]
 * so navigating between them doesn't tear down and reconnect. Auth token
 * comes from /api/socket/token (short-lived JWT, see that route).
 */
let socketPromise: Promise<Socket> | null = null;

export function getSocketClient(): Promise<Socket> {
  if (!socketPromise) {
    socketPromise = fetch("/api/socket/token")
      .then((res) => {
        if (!res.ok) throw new Error("Impossible d'authentifier la connexion temps réel.");
        return res.json();
      })
      .then(({ data }: { data: { token: string } }) => {
        const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";
        return io(url, { auth: { token: data.token } });
      })
      .catch((err) => {
        socketPromise = null;
        throw err;
      });
  }
  return socketPromise;
}
