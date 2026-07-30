import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extends NextAuth's default Session/JWT/User shapes with the fields our
 * RBAC middleware and UI need on every request: id, role, isPlatformAdmin,
 * tier, status. `isPlatformAdmin` (Phase 0 of the offers/payment rework, 30
 * juillet 2026) is the single source of truth for "is this account an
 * admin" — `role` is kept for compatibility during the Tier->Plan
 * transition but no new code should read it as an admin check.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      isPlatformAdmin: boolean;
      tier: string | null;
      status: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    isPlatformAdmin: boolean;
    tier: string | null;
    status: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    isPlatformAdmin: boolean;
    tier: string | null;
    status: string;
  }
}
