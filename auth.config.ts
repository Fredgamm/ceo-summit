import type { NextAuthConfig } from "next-auth";

/**
 * Sprint de correction (5 août 2026, EX-T01) — extrait de auth.ts pour que
 * `middleware.ts` puisse lire la session (JWT, edge runtime) sans jamais
 * charger le provider Credentials ni ses dépendances Node.js (bcrypt,
 * Prisma, et depuis ce sprint `ioredis` via le rate limiting). Le
 * middleware n'a besoin que de décoder le JWT existant, jamais d'exécuter
 * `authorize()` — cette config ne contient donc que ce qui est
 * edge-compatible : callbacks purs (aucun appel externe), pages, stratégie
 * de session. `auth.ts` complète avec `providers` pour tout le reste
 * (Server Actions, routes API).
 *
 * Avant ce sprint, `auth.ts` n'importait que prisma/bcryptjs — déjà
 * incompatibles edge en théorie, mais jamais un souci en pratique puisque
 * `authorize()` n'est jamais réellement invoqué depuis le chemin
 * middleware. `ioredis` casse différemment : son import de module lève une
 * erreur de *build* webpack (`node:diagnostics_channel`, scheme non géré
 * par le bundler edge) avant même l'exécution — d'où la nécessité de ce
 * découpage plutôt qu'un simple contournement runtime.
 */
export const authConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.isPlatformAdmin = user.isPlatformAdmin;
        token.tier = user.tier;
        token.hasCompanyAccess = user.hasCompanyAccess;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as (typeof session.user)["role"];
      session.user.isPlatformAdmin = token.isPlatformAdmin as boolean;
      session.user.tier = token.tier as string | null;
      session.user.hasCompanyAccess = token.hasCompanyAccess as boolean;
      session.user.status = token.status as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
