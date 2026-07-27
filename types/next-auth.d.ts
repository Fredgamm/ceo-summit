import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extends NextAuth's default Session/JWT/User shapes with the fields our
 * RBAC middleware and UI need on every request: id, role, tier, status.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      tier: string | null;
      status: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    tier: string | null;
    status: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    tier: string | null;
    status: string;
  }
}
