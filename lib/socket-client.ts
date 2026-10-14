import { io, type Socket } from "socket.io-client";

/**
 * Connexion unique du navigateur au serveur Socket.io autonome
 * (server/socket-server.ts), partagée entre salles et messagerie pour ne pas
 * se reconnecter à chaque navigation.
 *
 * Le jeton vient de /api/socket/token (JWT de 5 minutes). Il est redemandé à
 * chaque tentative de connexion (`auth` en fonction) : un jeton figé à la
 * première connexion expirait, et toute reconnexion après 5 minutes (veille,
 * coupure réseau) était refusée sans bruit. Après une reconnexion, chaque
 * écran doit rejoindre à nouveau sa salle ou sa conversation — voir
 * `onSocketReconnect`.
 */
let socketPromise: Promise<Socket> | null = null;

async function fetchSocketToken(): Promise<string> {
  const res = await fetch("/api/socket/token");
  if (!res.ok) throw new Error("Impossible d'authentifier la connexion temps réel.");
  const { data } = (await res.json()) as { data: { token: string } };
  return data.token;
}

export function getSocketClient(): Promise<Socket> {
  if (!socketPromise) {
    socketPromise = fetchSocketToken()
      .then((initialToken) => {
        let pendingToken: string | null = initialToken;
        // 14 oct. 2026 — sans NEXT_PUBLIC_SOCKET_URL (images de prod et de
        // préprod), le temps réel passe par le domaine de la page : nginx
        // relaie /socket.io/ vers le serveur temps réel de chaque instance.
        const url =
          process.env.NEXT_PUBLIC_SOCKET_URL ||
          (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");
        return io(url, {
          auth: (cb) => {
            if (pendingToken) {
              const token = pendingToken;
              pendingToken = null;
              cb({ token });
              return;
            }
            // Sans jeton, le serveur refuse la connexion et le client réessaie.
            fetchSocketToken().then(
              (token) => cb({ token }),
              () => cb({})
            );
          },
        });
      })
      .catch((err) => {
        socketPromise = null;
        throw err;
      });
  }
  return socketPromise;
}

/**
 * Exécute `rejoin` après chaque reconnexion réussie : le serveur oublie les
 * salles et conversations rejointes quand la connexion tombe. Renvoie la
 * fonction de désinscription, à appeler au démontage du composant.
 */
export function onSocketReconnect(socket: Socket, rejoin: () => void): () => void {
  socket.io.on("reconnect", rejoin);
  return () => {
    socket.io.off("reconnect", rejoin);
  };
}
