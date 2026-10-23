import path from "node:path";
import { fileURLToPath } from "node:url";

import withPWAInit from "@ducanh2912/next-pwa";

/**
 * EX-T01 (audit sécurité du 29 juillet 2026) — les 6 en-têtes HTTP de
 * sécurité exigés par le backlog étaient totalement absents. CSP en mode
 * `'unsafe-inline'` pour script-src/style-src plutôt qu'une CSP stricte à
 * base de nonces : Next.js App Router supporte les nonces mais ça
 * demanderait de les faire transiter middleware → layout → chaque script,
 * un chantier séparé qu'on ne peut pas vérifier sans navigateur réel ici.
 * À durcir (nonces, suppression de 'unsafe-inline') une fois vérifié en
 * conditions réelles (console devtools, violations CSP réelles).
 *
 * Vérifié en conditions réelles le 1er août 2026 : cette CSP casse
 * entièrement `next dev` (aucun clic ne fait quoi que ce soit sur aucune
 * page) — le runtime Fast Refresh/HMR de Next.js exécute du code via `eval`,
 * que `script-src` sans `'unsafe-eval'` bloque (`Uncaught EvalError` dans la
 * console). `next build`/`next start` (production) ne s'appuient pas sur ce
 * mécanisme, donc `'unsafe-eval'` n'est ajouté qu'en développement.
 */
const r2Origin = (() => {
  try {
    return process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).origin : null;
  } catch {
    return null;
  }
})();
const socketOrigin = process.env.NEXT_PUBLIC_SOCKET_URL ?? null;
const socketWsOrigin = socketOrigin ? socketOrigin.replace(/^http/, "ws") : null;

const CONNECT_SRC = ["'self'", socketOrigin, socketWsOrigin].filter(Boolean).join(" ");
const IMG_SRC = ["'self'", "data:", "blob:", r2Origin, "https://*.r2.cloudflarestorage.com"]
  .filter(Boolean)
  .join(" ");

const SCRIPT_SRC =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const CSP = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${IMG_SRC}`,
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * lib/r2.ts's local-storage fallback serves files (payment proofs, avatars…)
 * from our own origin instead of R2's, so the global `X-Frame-Options: DENY`
 * / `frame-ancestors 'none'` below — meant to stop OTHER sites framing our
 * pages — also blocks components/admin/entreprises/payment-proof-viewer.tsx
 * from previewing a PDF in its own same-origin <iframe>. Once R2 is
 * configured this route stops being reachable (see lib/r2.ts) and files are
 * framed straight from R2's domain, so this override becomes moot rather
 * than harmful to remove.
 */
const LOCAL_STORAGE_FRAME_CSP = CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 25 septembre 2026 (audit MVP) — l'optimiseur d'images de Next 14.2.35
  // (`/_next/image`) est exposé à une RCE non authentifiée
  // (GHSA-2xp9-vwfh-vxw4), et `*.amazonaws.com` en remotePatterns en faisait
  // en plus un proxy vers n'importe quel bucket S3. On ne l'utilise que pour
  // des assets statiques de /public (logos) et un QR code en `data:` :
  // `unoptimized` fait servir
  // `next/image` en `<img src>` direct, sans jamais passer par l'optimiseur.
  images: {
    unoptimized: true,
  },
  // Next 15 (14 oct. 2026) — anciennement experimental.serverComponentsExternalPackages.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  poweredByHeader: false,
  // 21 oct. 2026 — `next dev --turbopack` : dans un worktree, node_modules est
  // une jonction vers ../app/node_modules, que Turbopack refuse si elle pointe
  // hors de sa racine ("Symlink node_modules is invalid"). Racine = dossier
  // parent pour couvrir les deux. Sans effet sur le build webpack.
  turbopack: {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
      {
        source: "/api/dev/local-storage/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: LOCAL_STORAGE_FRAME_CSP },
        ],
      },
    ];
  },
};

/**
 * Service worker (next-pwa) — 23 oct. 2026, déconnexion qui « ne marchait pas » :
 *
 * - `dynamicStartUrlRedirect: "/login"` mettait la page /login au précache, à
 *   l'installation du service worker. Installé par un navigateur connecté,
 *   /login y renvoyait vers le tableau de bord : la copie gardée était donc le
 *   tableau de bord de la personne connectée, resservi sous /login à la
 *   déconnexion (et visible par le suivant sur un appareil partagé). Options
 *   `cacheStartUrl` / `dynamicStartUrl` / `dynamicStartUrlRedirect` retirées.
 * - Les règles « pages critiques » (E9-T01) appelaient une fonction définie
 *   ici, absente du service worker généré : elles plantaient et n'ont jamais
 *   servi. Remplacées par une seule règle : toute navigation va au serveur
 *   (jamais une page personnelle depuis un cache) ; hors connexion, la page
 *   /~offline s'affiche (`fallbacks.document`).
 *
 * Restent en cache les ressources statiques (JS, CSS, polices, images) via le
 * cache par défaut de next-pwa. Les appels d'authentification (/api/auth/*)
 * ne passent jamais par un cache (21 oct. 2026 : un jeton CSRF périmé y
 * bloquait la déconnexion).
 *
 * ATTENTION : les fonctions `urlPattern` sont recopiées telles quelles dans
 * public/sw.js — elles ne doivent rien utiliser de ce fichier (constantes,
 * fonctions), seulement leurs paramètres.
 */
const withPWA = withPWAInit({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  // Activés par défaut : précache et route « start-url » de « / », qui
  // redirige selon la session (tableau de bord ou connexion).
  cacheStartUrl: false,
  dynamicStartUrl: false,
  fallbacks: {
    document: "/~offline",
  },
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/auth/"),
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkOnly",
      },
    ],
  },
});

export default withPWA(nextConfig);
