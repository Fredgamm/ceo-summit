/**
 * 3 septembre 2026 (catalogue de sponsoring en euros) — conversion EUR→Ar
 * pour l'affichage informatif "≈ X Ar" des offres cotées en euros
 * (Plan.priceEur). N'alimente jamais un calcul de montant dû : le montant
 * réellement facturé/validé reste toujours Plan.priceAr, figé au moment de
 * la création/modification de l'offre par l'admin — voir schema.prisma.
 *
 * Taux mis en cache en mémoire (process) pendant CACHE_TTL_MS pour éviter un
 * appel réseau à chaque affichage de page ; secours sur un taux fixe si
 * l'API externe est indisponible, plutôt que de faire échouer la création
 * d'une offre.
 */

const RATE_API_URL = "https://open.er-api.com/v6/latest/EUR";
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Taux de secours (approximatif, révisé le 3 septembre 2026) si l'API est injoignable. */
const FALLBACK_EUR_TO_AR_RATE = 4850;

let cachedRate: { value: number; fetchedAt: number } | null = null;

async function fetchLiveEurToArRate(): Promise<number> {
  const response = await fetch(RATE_API_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Taux de change indisponible (HTTP ${response.status})`);
  const data = (await response.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.MGA;
  if (!rate || rate <= 0) throw new Error("Taux EUR→MGA absent de la réponse");
  return rate;
}

export async function getEurToArRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_TTL_MS) {
    return cachedRate.value;
  }
  try {
    const rate = await fetchLiveEurToArRate();
    cachedRate = { value: rate, fetchedAt: Date.now() };
    return rate;
  } catch {
    return cachedRate?.value ?? FALLBACK_EUR_TO_AR_RATE;
  }
}

export async function convertEurToAr(amountEur: number): Promise<number> {
  const rate = await getEurToArRate();
  return Math.round(amountEur * rate);
}
