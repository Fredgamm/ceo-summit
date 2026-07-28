import { randomUUID } from "crypto";

import { getRedisClient } from "@/lib/redis";

const DEFAULT_TTL_MS = 5000;

export class LockBusyError extends Error {
  constructor(message = "Resource is locked, try again shortly.") {
    super(message);
    this.name = "LockBusyError";
  }
}

/**
 * Generic short-lived SET NX distributed lock — used wherever a critical
 * section needs to be serialized across concurrent requests (event
 * registration capacity, Deal Room credit deduction, ...). See
 * lib/event-registration-lock.ts for the original use case this was
 * extracted from.
 */
export async function withRedisLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
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
