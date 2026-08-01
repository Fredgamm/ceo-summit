import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extends NextAuth's default Session/JWT/User shapes with the fields our
 * RBAC middleware and UI need on every request: id, role, isPlatformAdmin,
 * tier, hasCompanyAccess, status. `isPlatformAdmin` (Phase 0 of the
 * offers/payment rework, 30 juillet 2026) is the single source of truth for
 * "is this account an admin" — `role` is kept for compatibility during the
 * Tier->Plan transition but no new code should read it as an admin check.
 * `hasCompanyAccess` (Phase 2) is true when the account's company has an
 * ACTIVE CompanySubscription — grants the same platform access as a
 * personal `tier` for every member of that company, not just its admin.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      isPlatformAdmin: boolean;
      tier: string | null;
      hasCompanyAccess: boolean;
      status: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    isPlatformAdmin: boolean;
    tier: string | null;
    hasCompanyAccess: boolean;
    status: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    isPlatformAdmin: boolean;
    tier: string | null;
    hasCompanyAccess: boolean;
    status: string;
  }
}
