import { randomUUID } from "crypto";

import { getRedisClient } from "@/lib/redis";

const LOCK_TTL_MS = 5000;

export class RegistrationLockBusyError extends Error {
  constructor() {
    super(
      "Une autre inscription est en cours de traitement pour cet événement. Réessayez dans un instant."
    );
    this.name = "RegistrationLockBusyError";
  }
}

/**
 * E3-T03 — "Vérification capacité (mutex Redis pour éviter overbooking)".
 * A short-lived SET NX lock per event serializes registration attempts so
 * two concurrent requests can't both pass the capacity check and both
 * succeed, overselling the event. `fn` should do the capacity check and
 * the EventRegistration create while holding the lock.
 */
export async function withEventRegistrationLock<T>(
  eventId: string,
  fn: () => Promise<T>
): Promise<T> {
  const redis = getRedisClient();
  const lockKey = `lock:event:${eventId}:register`;
  const token = randomUUID();

  const acquired = await redis.set(lockKey, token, "PX", LOCK_TTL_MS, "NX");
  if (!acquired) {
    throw new RegistrationLockBusyError();
  }

  try {
    return await fn();
  } finally {
    // Best-effort release — the short TTL is the real safety net if this
    // process dies mid-lock, so an unconditional DEL here is acceptable.
    await redis.del(lockKey);
  }
}
