/**
 * Correctif (7 août 2026, audit) — le coût bcrypt `12` était répété en dur
 * dans 6 endroits (auth.ts ×3, company-invites.ts, prisma/seed.ts ×2) sans
 * source unique — un futur changement de coût (durcissement sécurité,
 * migration vers un algorithme différent) aurait dû être répercuté partout
 * à la main, avec le risque d'en oublier un.
 */
export const BCRYPT_ROUNDS = 12;
