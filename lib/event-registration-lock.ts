import { withRedisLock, LockBusyError } from "@/lib/redis-lock";

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
  try {
    return await withRedisLock(`lock:event:${eventId}:register`, fn);
  } catch (err) {
    if (err instanceof LockBusyError) throw new RegistrationLockBusyError();
    throw err;
  }
}
