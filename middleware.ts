import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

/**
 * RBAC middleware — runs on every request matched by `config.matcher` below.
 * Ref: CEO_Summit_Architecture_Technique.docx §Auth
 *   "Middleware de vérification RBAC sur chaque route protégée"
 *
 * This is the coarse-grained wall: authenticated vs not, member-space vs admin-space.
 * Fine-grained tier checks (e.g. "this Deal Room opportunity requires Executive+")
 * happen inside the page/server action itself, close to the data being gated.
 *
 * Sprint de correction (5 août 2026, EX-T01) — instance NextAuth séparée à
 * partir de `auth.config.ts` (pas `@/auth`) : le middleware tourne sur le
 * runtime edge, qui ne peut pas bundler les dépendances Node.js du provider
 * Credentials (bcrypt, Prisma, et depuis ce sprint `ioredis` via le rate
 * limiting — son import fait planter le build webpack edge sur
 * `node:diagnostics_channel`, un échec de compilation, pas seulement
 * d'exécution). Le middleware n'a de toute façon besoin que de décoder le
 * JWT existant, jamais d'exécuter `authorize()`.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = [
  "/login",
  "/mot-de-passe-oublie",
  "/demande-acces",
  "/cgu",
  "/confidentialite",
  "/",
  "/~offline",
];
const PUBLIC_PREFIXES = ["/activer/", "/reinitialiser/", "/invitation/"];

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Phase 2 offres/paiement (30 juillet 2026) — reachable even before any
 * personal tier or active company subscription exists: an ungated user must
 * be able to finish onboarding, create/manage a company, invite teammates,
 * choose an offer and pay. Without this carve-out, the gate below would
 * bounce them to /paiement-en-attente before they could ever reach the flow
 * meant to get them out of it.
 */
const ACCOUNT_SETUP_PREFIXES = [
  "/entreprise",
  "/entreprises",
  "/bienvenue",
  "/profil",
  // API routes called from the account-setup pages above (company logo,
  // payment proof upload) — without this, this same gate below redirected
  // the fetch() itself to /paiement-en-attente (307, body/method preserved),
  // which then choked on the multipart body it never expected: uploads from
  // /entreprise/creer and /entreprise/paiement silently failed for anyone
  // without company access yet, i.e. everyone still in this exact flow.
  "/api/company",
];

function isAccountSetupRoute(pathname: string) {
  return ACCOUNT_SETUP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isAdminRoute = pathname.startsWith("/admin");
  const isPublic = isPublicRoute(pathname);

  // Not authenticated → block everything except public routes.
  if (!session?.user) {
    if (isPublic) return NextResponse.next();
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but hitting /login or similar → send to dashboard instead.
  if (isPublic && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  // Admin space requires isPlatformAdmin specifically (not just an active tier).
  if (isAdminRoute && !session.user.isPlatformAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  // Member space requires an active account (webhook-created accounts start
  // as PENDING_ACTIVATION and must go through /activer/[token] first).
  if (!isAdminRoute && !isPublic && session.user.status !== "ACTIVE") {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  // 4 août 2026 (CEO Summit devenu intégralement B2B) — chaque compte est
  // rattaché à une entreprise ; `hasCompanyAccess` (vrai si l'entreprise a
  // un CompanySubscription ACTIVE ou EXPIRED — RG-12, seul l'accès à
  // l'édition d'évènement expire, pas les avantages plateforme) couvre tous
  // les collaborateurs, pas seulement l'admin entreprise. Les routes de mise
  // en place du compte (entreprise, bienvenue, profil) restent atteignables
  // même sans accès — sinon impossible de jamais en sortir.
  if (
    !isAdminRoute &&
    !isPublic &&
    !isAccountSetupRoute(pathname) &&
    !session.user.isPlatformAdmin &&
    !session.user.hasCompanyAccess &&
    pathname !== "/paiement-en-attente"
  ) {
    return NextResponse.redirect(new URL("/paiement-en-attente", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - static assets (_next/static, _next/image, favicon, icons, logo, splash, manifest)
     * - the PWA service worker + its generated helper scripts (sw.js,
     *   workbox-*.js, fallback-*.js, E9-T01) — same class of bug as icons/logo
     *   above: a logged-out browser could never register the service worker
     *   if this middleware redirected the SW file itself to /login.
     * - API routes that manage their own auth:
     *   - api/webhooks must stay public for payments/Zoom/Resend
     *   - api/auth is NextAuth's own surface (csrf, signin, callback/credentials,
     *     session, signout...) — it must be reachable *without* a session, since
     *     that's exactly how a session gets created. Blocking it here made login
     *     itself impossible: signIn() calls /api/auth/callback/credentials, which
     *     this middleware redirected to /login before NextAuth ever saw it.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|logo|splash|manifest.json|sw\\.js|workbox-|fallback-|api/webhooks|api/auth).*)",
  ],
};
