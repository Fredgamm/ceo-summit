import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extends NextAuth's default Session/JWT/User shapes with the fields our
 * RBAC middleware and UI need on every request: id, role, isPlatformAdmin,
 * tier, hasCompanyAccess, status. `isPlatformAdmin` (Phase 0 of the
 * offers/payment rework, 30 juillet 2026) is the single source of truth for
 * "is this account an admin" — `role` is kept for compatibility during the
 * Tier->Plan transition but no new code should read it as an admin check.
 * `tier`/`hasCompanyAccess` (4 août 2026 — CEO Summit devenu intégralement
 * B2B) are both derived from the account's company plan rank (see
 * lib/plan-access.ts::getViewerTierFromCompany) — every account belongs to a
 * company, there is no more personal membership tier.
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
