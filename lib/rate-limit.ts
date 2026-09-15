import { getRedisClient } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

const memoryStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Sprint de correction (5 août 2026, EX-T01) — compteur à fenêtre fixe, la
 * plus grosse exigence sécurité encore non traitée de l'audit du 29 juillet
 * (aucune protection anti-brute-force sur le login ni ailleurs). Backé par
 * Redis (`INCR` + `PEXPIRE`) quand `REDIS_URL` est configuré — seule
 * garantie correcte à travers plusieurs instances en production. Sans
 * Redis (cet environnement de dev, voir BACKLOG_DEV.md "Dette technique
 * connue"), dégrade en `Map` en mémoire — un simple garde-fou mono-instance,
 * pas une garantie distribuée, même limitation honnête que
 * lib/redis-lock.ts.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  if (process.env.REDIS_URL) {
    try {
      const redis = getRedisClient();
      const redisKey = `ratelimit:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.pexpire(redisKey, windowSec * 1000);
      }
      if (count > limit) {
        const ttlMs = await redis.pttl(redisKey);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)) };
      }
      return { allowed: true, retryAfterSec: 0 };
    } catch (err) {
      // 15 septembre 2026 — un Redis en échec d'écriture (MISCONF disque
      // plein/permissions, vu en prod) faisait planter tout appelant
      // (signup, login, etc.) avec une 500, alors qu'un simple garde-fou
      // anti-abus ne doit jamais bloquer un usage légitime : on ouvre plutôt
      // que de casser, même compromis que la dégradation "pas de Redis"
      // ci-dessous.
      console.error("[rate-limit] Redis error, failing open", err);
      return { allowed: true, retryAfterSec: 0 };
    }
  }

  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}
