import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * NextAuth v5 config — Credentials provider only (email + password).
 * Ref: CEO_Summit_Architecture_Technique.docx §Authentification
 *   - JWT signé HS256, durée 24h, cookie httpOnly SameSite=Strict (NextAuth default)
 *   - Mots de passe hashés bcrypt (rounds: 12) — see prisma/seed.ts and activation flow
 *   - RBAC : 5 rôles (guest/member/executive/chairman/admin) embedded in the JWT
 *     and re-checked on every request by middleware.ts
 *
 * Session strategy is "jwt" (not "database") because Credentials provider
 * doesn't support the database session strategy in NextAuth v5.
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24h — matches architecture doc
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: {
            memberships: {
              where: { status: "ACTIVE" },
              orderBy: { endDate: "desc" },
              take: 1,
            },
          },
        });

        if (!user || !user.passwordHash) return null;

        // Suspended/cancelled accounts cannot authenticate at all.
        if (user.status === "SUSPENDED" || user.status === "CANCELLED") {
          throw new Error("ACCOUNT_SUSPENDED");
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          role: user.role,
          tier: user.memberships[0]?.tier ?? null,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Only runs on sign-in (user is defined) — subsequent requests reuse the token.
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tier = user.tier;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      // NextAuth v5's built-in JWT type doesn't always merge cleanly with our
      // module augmentation (types/next-auth.d.ts) depending on TS resolution
      // order, so we assert here rather than fight the inference.
      session.user.id = token.id as string;
      session.user.role = token.role as (typeof session.user)["role"];
      session.user.tier = token.tier as string | null;
      session.user.status = token.status as string;
      return session;
    },
  },
});
