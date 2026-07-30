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

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${IMG_SRC}`,
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.amazonaws.com" },
    ],
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
    ];
  },
};

const CRITICAL_PAGES = ["/login", "/dashboard", "/messagerie"];
const MEMBER_PAGE_PREFIXES = [
  "/dashboard",
  "/deal-room",
  "/evenements",
  "/catalogue",
  "/salles",
  "/credits",
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
 * E9-T01 — offline support for the 3 pages the backlog calls out by name
 * (login, dashboard, messagerie) plus a StaleWhileRevalidate layer for every
 * other member-facing page. Both sit *ahead* of `@ducanh2912/next-pwa`'s own
 * defaultCache (fonts/images/JS/CSS/API), which we keep via
 * extendDefaultRuntimeCaching — we're only overriding page-navigation
 * caching, not asset caching.
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
