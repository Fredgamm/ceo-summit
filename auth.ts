import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { checkRateLimit } from "@/lib/rate-limit";

const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_SEC = 15 * 60;
// 25 septembre 2026 (audit MVP) — plus large que la limite par email : une
// même IP peut légitimement porter tous les dirigeants d'une entreprise
// (NAT de bureau), mais un credential stuffing (1 essai par email, des
// milliers d'emails) passait jusqu'ici sous la seule limite par email.
const LOGIN_IP_RATE_LIMIT = 50;

/**
 * Hash bcrypt constant (coût 12, même que BCRYPT_ROUNDS) d'une valeur
 * aléatoire jetée — comparé quand l'email est inconnu ou le compte sans mot
 * de passe, pour que ces cas prennent le même temps (~250 ms) qu'un vrai
 * mauvais mot de passe au lieu de répondre instantanément.
 */
const DUMMY_PASSWORD_HASH = "$2a$12$FC2MalkGVo.3uwS4FYSHgOCcFcQrR7XiYVPVbGfincrT3hQGKf1c2";

/**
 * NextAuth v5 config — Credentials provider only (email + password).
 * Ref: CEO_Summit_Architecture_Technique.docx §Authentification
 *   - JWT signé HS256, durée 24h, cookie httpOnly SameSite=Lax (défaut NextAuth,
 *     non surchargé dans auth.config.ts — et non Strict comme l'annonçait ce
 *     commentaire jusqu'à l'audit du 25 septembre 2026)
 *   - Mots de passe hashés bcrypt (rounds: 12) — see prisma/seed.ts and activation flow
 *   - RBAC : 5 rôles (guest/member/executive/chairman/admin) embedded in the JWT
 *     and re-checked on every request by middleware.ts
 *
 * Session strategy is "jwt" (not "database") because Credentials provider
 * doesn't support the database session strategy in NextAuth v5.
 *
 * `session`/`pages`/`callbacks` viennent de `auth.config.ts` (sprint de
 * correction du 5 août 2026, EX-T01) — seul ce fichier-ci ajoute le
 * provider Credentials et ses dépendances Node.js (bcrypt, Prisma,
 * `checkRateLimit`/ioredis), volontairement absentes de la config
 * edge-compatible que `middleware.ts` utilise.
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Même source que lib/request-ip.ts (`X-Real-IP` posé par Nginx d'abord,
 * voir la doc de getClientIp), mais lue sur la `Request` qu'Auth.js passe à
 * `authorize()` plutôt que via `next/headers`.
 */
function getRequestIp(request: Request | undefined): string {
  const realIp = request?.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwardedFor = request?.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

/** Exporté pour les tests (auth.test.ts) — branché ci-dessous sur Credentials. */
export async function authorizeCredentials(rawCredentials: unknown, request?: Request) {
  const parsed = credentialsSchema.safeParse(rawCredentials);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  // Sprint de correction (5 août 2026, EX-T01) — anti-brute-force :
  // 10 tentatives / 15 min par email, avant même la requête Prisma
  // (protège aussi contre la charge d'un brute-force, pas seulement
  // le compte visé). Doublé le 25 septembre 2026 d'une limite par IP.
  const ipRateLimit = await checkRateLimit(
    `login-ip:${getRequestIp(request)}`,
    LOGIN_IP_RATE_LIMIT,
    LOGIN_RATE_WINDOW_SEC
  );
  if (!ipRateLimit.allowed) {
    throw new Error("RATE_LIMITED");
  }
  const rateLimit = await checkRateLimit(
    `login:${email.toLowerCase()}`,
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_SEC
  );
  if (!rateLimit.allowed) {
    throw new Error("RATE_LIMITED");
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: VIEWER_TIER_INCLUDE,
  });

  // 25 septembre 2026 (audit MVP) — anti-énumération. Auparavant, les
  // statuts (PENDING_ACTIVATION/SUSPENDED/EXPIRED) étaient révélés avant
  // toute vérification du mot de passe : n'importe qui pouvait savoir si un
  // email avait un compte, et dans quel état, sans le connaître — et un
  // email inconnu répondait instantanément (pas de bcrypt), autre fuite par
  // le timing. Désormais : bcrypt toujours exécuté (hash factice si besoin),
  // et un statut n'est révélé qu'au titulaire ayant fourni le bon mot de
  // passe.
  //
  // Conséquence voulue : un compte PENDING_ACTIVATION sans passwordHash (le
  // cas normal — B2b, audit du 29 juillet 2026) retombe dans le générique
  // "Email ou mot de passe incorrect", puisqu'aucun mot de passe ne peut y
  // être vérifié. Le membre active son compte via le lien reçu par email
  // (ou le formulaire de renvoi, lui-même neutre, voir actions/auth.ts).
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.passwordHash || !valid) return null;

  // Compte ayant déjà un mot de passe mais encore marqué en attente (cas
  // marginal) — même message qu'avant, maintenant réservé au titulaire.
  if (user.status === "PENDING_ACTIVATION") {
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

  // L'accès plateforme vient de l'offre de l'entreprise (voir
  // lib/plan-access.ts). `EXPIRED` compte encore : seul l'accès à
  // l'édition d'évènement expire, pas les avantages plateforme (RG-12).
  const hasCompanyAccess = getViewerTierFromCompany(user.company) !== null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.avatarUrl,
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    hasCompanyAccess,
    status,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  // Déploiement auto-hébergé derrière Nginx (pas Vercel, qui définit ça
  // automatiquement) — sans ça, NextAuth v5 rejette toute requête en mode
  // production (`next start`) avec une erreur "UntrustedHost", même quand
  // le Host correspond exactement à NEXTAUTH_URL. Trouvé en testant le
  // sprint de sécurité du 29 juillet 2026 en conditions de production.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
});
