import withPWAInit from "@ducanh2912/next-pwa";

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
