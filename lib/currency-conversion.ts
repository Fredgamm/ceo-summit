import { prisma } from "@/lib/prisma";

/**
 * 3 septembre 2026 (catalogue de sponsoring en euros) — conversion EUR→Ar.
 * Depuis le 12 oct. 2026, ce taux sert aussi au montant facturé des offres
 * cotées en euros (voir lib/company-payment-amount.ts::unitPriceAr).
 *
 * Source : ExchangeRate-API, accès libre (open.er-api.com), mis à jour une
 * fois par jour. Taux gardé en mémoire (processus) pendant CACHE_TTL_MS pour
 * éviter un appel réseau à chaque affichage de page.
 *
 * Si la source est injoignable : dernier taux reçu (en mémoire, sinon
 * enregistré en base à chaque réception, donc conservé après un redémarrage
 * ou un déploiement), et seulement en tout dernier recours un taux fixe.
 */

const RATE_API_URL = "https://open.er-api.com/v6/latest/EUR";
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Dernier taux reçu, enregistré dans PlatformSetting (valeur JSON : { rate, fetchedAt }). */
export const LAST_EUR_TO_AR_RATE_KEY = "eur_to_ar_last_rate";
/** Tout dernier recours (aucun taux jamais reçu) — révisé le 12 octobre 2026. */
const FALLBACK_EUR_TO_AR_RATE = 5050;

let cachedRate: { value: number; fetchedAt: number } | null = null;

async function fetchLiveEurToArRate(): Promise<number> {
  const response = await fetch(RATE_API_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Taux de change indisponible (HTTP ${response.status})`);
  const data = (await response.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.MGA;
  if (!rate || rate <= 0) throw new Error("Taux EUR→MGA absent de la réponse");
  return rate;
}

async function saveLastRate(rate: number, fetchedAt: number): Promise<void> {
  try {
    const value = JSON.stringify({ rate, fetchedAt: new Date(fetchedAt).toISOString() });
    await prisma.platformSetting.upsert({
      where: { key: LAST_EUR_TO_AR_RATE_KEY },
      update: { value },
      create: { key: LAST_EUR_TO_AR_RATE_KEY, value },
    });
  } catch (err) {
    console.error("[currency-conversion] enregistrement du dernier taux impossible", err);
  }
}

async function readLastRate(): Promise<number | null> {
  try {
    const setting = await prisma.platformSetting.findUnique({
      where: { key: LAST_EUR_TO_AR_RATE_KEY },
    });
    if (!setting) return null;
    const rate = Number((JSON.parse(setting.value) as { rate?: unknown }).rate);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

export async function getEurToArRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_TTL_MS) {
    return cachedRate.value;
  }
  try {
    const rate = await fetchLiveEurToArRate();
    cachedRate = { value: rate, fetchedAt: Date.now() };
    await saveLastRate(rate, cachedRate.fetchedAt);
    return rate;
  } catch (err) {
    console.error(
      "[currency-conversion] taux du jour indisponible, dernier taux connu utilisé",
      err
    );
    if (cachedRate) return cachedRate.value;
    return (await readLastRate()) ?? FALLBACK_EUR_TO_AR_RATE;
  }
}

export async function convertEurToAr(amountEur: number): Promise<number> {
  const rate = await getEurToArRate();
  return Math.round(amountEur * rate);
}
