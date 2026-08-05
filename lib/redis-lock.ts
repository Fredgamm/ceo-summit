import { randomUUID } from "crypto";

import { getRedisClient } from "@/lib/redis";

const DEFAULT_TTL_MS = 5000;

export class LockBusyError extends Error {
  constructor(message = "Resource is locked, try again shortly.") {
    super(message);
    this.name = "LockBusyError";
  }
}

let warnedNoRedis = false;

/**
 * Generic short-lived SET NX distributed lock — used wherever a critical
 * section needs to be serialized across concurrent requests (event
 * registration capacity, Deal Room credit deduction, ...). See
 * lib/event-registration-lock.ts for the original use case this was
 * extracted from.
 *
 * Sprint de correction (5 août 2026) — sans `REDIS_URL` configuré (aucune
 * instance Redis dans cet environnement de dev, voir BACKLOG_DEV.md "Dette
 * technique connue"), `getRedisClient()` levait une exception, ce qui
 * faisait planter en dur toute inscription à un évènement ou déduction de
 * crédit dès le premier appel réel (pas seulement en test, où l'appel est
 * mocké). Dégrade maintenant en no-op — `fn` s'exécute sans verrou plutôt
 * que de faire échouer l'action appelante. Ce n'est PAS une garantie
 * d'exclusion mutuelle en dehors d'une seule instance de développement ; à
 * corriger en configurant un vrai Redis avant toute mise en charge réelle.
 */
export async function withRedisLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  if (!process.env.REDIS_URL) {
    if (!warnedNoRedis) {
      console.warn(
        `[redis-lock] REDIS_URL non configuré — verrou "${lockKey}" ignoré (no-op). Voir BACKLOG_DEV.md.`
      );
      warnedNoRedis = true;
    }
    return fn();
  }

  const redis = getRedisClient();
  const token = randomUUID();

  const acquired = await redis.set(lockKey, token, "PX", ttlMs, "NX");
  if (!acquired) {
    throw new LockBusyError(`Lock busy: ${lockKey}`);
  }

  try {
    return await fn();
  } finally {
    // Best-effort release — the short TTL is the real safety net if this
    // process dies mid-lock, so an unconditional DEL here is acceptable.
    await redis.del(lockKey);
  }
}
