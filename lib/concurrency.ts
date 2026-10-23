/**
 * Applique `fn` à chaque élément, au plus `limit` à la fois, et renvoie les
 * résultats dans l'ordre. Sert aux envois d'e-mails en nombre par le SMTP de
 * ceo-summit.mg (hébergement mutualisé, envois limités) : des centaines de
 * connexions simultanées s'y font refuser ou classer en spam.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
