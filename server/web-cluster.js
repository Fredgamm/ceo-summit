/**
 * Lanceur de production (9 oct. 2026) : plusieurs processus `next start`
 * sur le même port, pour utiliser plusieurs cœurs du serveur — un seul
 * processus Node n'en occupe qu'un. Module `cluster` natif : le processus
 * principal répartit les connexions entre les processus enfants et relance
 * un enfant qui s'arrête.
 *
 * Nombre de processus : WEB_CONCURRENCY (2 par défaut). Chaque processus
 * consomme 150 à 400 Mo de mémoire : à ajuster selon la mémoire du serveur.
 *
 * Aucun état partagé n'est gardé en mémoire d'un processus : sessions en JWT,
 * limitation de débit et verrous dans Redis, temps réel dans le conteneur
 * `socket` (server/socket-server.ts), un processus à part.
 */
const cluster = require("node:cluster");

const workers = Math.max(1, Number.parseInt(process.env.WEB_CONCURRENCY ?? "2", 10) || 2);

if (cluster.isPrimary) {
  console.log(`[web-cluster] démarrage de ${workers} processus Next.js`);
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on("online", (worker) => {
    console.log(`[web-cluster] processus ${worker.process.pid} démarré`);
  });

  let stopping = false;
  cluster.on("exit", (worker, code, signal) => {
    if (stopping) return;
    console.error(
      `[web-cluster] processus ${worker.process.pid} arrêté (code ${code}, signal ${signal}) — relance`
    );
    cluster.fork();
  });

  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      stopping = true;
      for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(sig);
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  }
} else {
  process.argv = [process.argv[0], "next", "start"];
  require("next/dist/bin/next");
}
