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
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  poweredByHeader: false,
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

const CRITICAL_PAGES = ["/dashboard", "/messagerie"];
const MEMBER_PAGE_PREFIXES = [
  "/dashboard",
  "/deal-room",
  "/evenements",
  "/catalogue",
  "/salles",
  "/entreprise",
  "/entreprises",
  "/membres",
  "/messagerie",
  "/profil",
];

function matchesNavigationTo(pathname, prefixes) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * E9-T01 — offline support for the pages the backlog calls out by name
 * (dashboard, messagerie) plus a StaleWhileRevalidate layer for every other
 * member-facing page. Both sit *ahead* of `@ducanh2912/next-pwa`'s own
 * defaultCache (fonts/images/JS/CSS/API), which we keep via
 * extendDefaultRuntimeCaching — we're only overriding page-navigation
 * caching, not asset caching.
 *
 * 23 septembre 2026 (incident cache) — /login était dans CRITICAL_PAGES et se
 * retrouvait donc servi depuis un cache vieux de 7 jours (NetworkFirst avec
 * timeout 4s : sur un réseau lent, la version en cache l'emportait). Une page
 * de login n'a aucune utilité hors-ligne (on ne peut pas s'authentifier sans
 * réseau) — la mettre en cache ne fait que risquer de servir du contenu
 * périmé (ex: un lien qu'on vient de retirer) sans jamais apporter le
 * bénéfice recherché. Route explicite en NetworkOnly, placée avant le
 * defaultCache de next-pwa (qui mettrait sinon les pages en cache 24h via son
 * propre NetworkFirst) pour garantir que /login reflète toujours le serveur.
 */
const withPWA = withPWAInit({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  cacheStartUrl: true,
  dynamicStartUrl: true,
  // manifest.json's start_url (/dashboard) redirects unauthenticated
  // visitors to /login — see middleware.ts.
  dynamicStartUrlRedirect: "/login",
  fallbacks: {
    document: "/~offline",
  },
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ url, request }) => request.mode === "navigate" && url.pathname === "/login",
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ url, request }) =>
          request.mode === "navigate" && matchesNavigationTo(url.pathname, CRITICAL_PAGES),
        handler: "NetworkFirst",
        options: {
          cacheName: "ceo-summit-critical-pages",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: ({ url, request }) =>
          request.mode === "navigate" && matchesNavigationTo(url.pathname, MEMBER_PAGE_PREFIXES),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "ceo-summit-member-pages",
          expiration: { maxEntries: 40, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
    ],
  },
});

export default withPWA(nextConfig);
