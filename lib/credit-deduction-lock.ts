import { withRedisLock, LockBusyError } from "@/lib/redis-lock";

export class CreditDeductionLockBusyError extends Error {
  constructor() {
    super("Une autre opération sur vos crédits est en cours. Réessayez dans un instant.");
    this.name = "CreditDeductionLockBusyError";
  }
}

/**
 * E6-T04 — "Déduction atomique (transaction Prisma pour éviter race
 * condition)". The Redis lock serializes concurrent deduction attempts for
 * the same user (e.g. double-clicking "Prendre contact"); the Prisma
 * transaction inside `fn` makes the balance-check-then-deduct itself
 * atomic against partial writes.
 */
export async function withCreditDeductionLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await withRedisLock(`lock:user:${userId}:credits`, fn);
  } catch (err) {
    if (err instanceof LockBusyError) throw new CreditDeductionLockBusyError();
    throw err;
  }
}
