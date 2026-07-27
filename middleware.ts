import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * RBAC middleware — runs on every request matched by `config.matcher` below.
 * Ref: CEO_Summit_Architecture_Technique.docx §Auth
 *   "Middleware de vérification RBAC sur chaque route protégée"
 *
 * This is the coarse-grained wall: authenticated vs not, member-space vs admin-space.
 * Fine-grained tier checks (e.g. "this Deal Room opportunity requires Executive+")
 * happen inside the page/server action itself, close to the data being gated.
 */

const PUBLIC_ROUTES = ["/login", "/mot-de-passe-oublie", "/demande-acces", "/"];
const PUBLIC_PREFIXES = ["/activer/", "/reinitialiser/"];

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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

  // Admin space requires the ADMIN role specifically (not just an active tier).
  if (isAdminRoute && session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  // Member space requires an active account (webhook-created accounts start
  // as PENDING_ACTIVATION and must go through /activer/[token] first).
  if (!isAdminRoute && !isPublic && session.user.status !== "ACTIVE") {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - static assets (_next/static, _next/image, favicon, icons, manifest)
     * - API routes that manage their own auth (webhooks must stay public for Evolia/Zoom/Resend)
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|api/webhooks).*)",
  ],
};
