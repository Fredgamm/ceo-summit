import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";

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
  // Déploiement auto-hébergé derrière Nginx (pas Vercel, qui définit ça
  // automatiquement) — sans ça, NextAuth v5 rejette toute requête en mode
  // production (`next start`) avec une erreur "UntrustedHost", même quand
  // le Host correspond exactement à NEXTAUTH_URL. Trouvé en testant le
  // sprint de sécurité du 29 juillet 2026 en conditions de production.
  trustHost: true,
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
          include: VIEWER_TIER_INCLUDE,
        });

        if (!user) return null;

        // B2b (audit du 29 juillet 2026) — un compte PENDING_ACTIVATION n'a
        // pas encore de passwordHash, donc tombait auparavant dans le même
        // "Email ou mot de passe incorrect" générique qu'un vrai échec —
        // trompeur, puisque le vrai problème est "activez d'abord votre
        // compte". Pas un souci d'énumération ici : le flux d'activation
        // (resendActivationLink) part déjà du principe inverse ("no account
        // found" est volontairement révélé, voir actions/auth.ts).
        if (!user.passwordHash) {
          throw new Error("ACCOUNT_PENDING_ACTIVATION");
        }

        // Suspended/cancelled accounts cannot authenticate at all.
        if (user.status === "SUSPENDED" || user.status === "CANCELLED") {
          throw new Error("ACCOUNT_SUSPENDED");
        }

        // B3 — un compte EXPIRED s'authentifiait avec succès puis tombait
        // dans une boucle de redirection infinie /dashboard ⇄ /login
        // (middleware.ts bloque le non-ACTIVE sur les routes membres, mais
        // renvoie tout /login authentifié vers /dashboard). Le bloquer ici,
        // comme SUSPENDED, casse la boucle. Noter que `User.status` n'est
        // plus synchronisé automatiquement à l'expiration (c'était piloté
        // par `Membership.endDate`, supprimé le 4 août 2026 — CEO Summit
        // devenu intégralement B2B) : l'expiration d'accès se joue
        // désormais au niveau de `CompanySubscription.status` (RG-12), pas
        // de `User.status`.
        const status = user.status;
        if (status === "EXPIRED") {
          throw new Error("ACCOUNT_EXPIRED");
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // 4 août 2026 (CEO Summit devenu intégralement B2B) — le tier et
        // l'accès plateforme viennent désormais exclusivement du rang de
        // l'offre de l'entreprise (voir lib/plan-access.ts). `EXPIRED`
        // compte encore pour l'accès plateforme : seul l'accès à l'édition
        // d'évènement expire, pas les avantages plateforme (RG-12).
        const tier = getViewerTierFromCompany(user.company);
        const hasCompanyAccess = tier !== null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          role: user.role,
          isPlatformAdmin: user.isPlatformAdmin,
          tier,
          hasCompanyAccess,
          status,
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
        token.isPlatformAdmin = user.isPlatformAdmin;
        token.tier = user.tier;
        token.hasCompanyAccess = user.hasCompanyAccess;
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
      session.user.isPlatformAdmin = token.isPlatformAdmin as boolean;
      session.user.tier = token.tier as string | null;
      session.user.hasCompanyAccess = token.hasCompanyAccess as boolean;
      session.user.status = token.status as string;
      return session;
    },
  },
});
