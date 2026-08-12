/**
 * Client SMS — Befiana (https://api.befiana.cloud). Suit le même pattern
 * paresseux que lib/resend.ts : ne lève que si l'appelant tente vraiment
 * d'envoyer un SMS sans `BEFIANA_API_KEY` configurée, jamais au chargement
 * du module (environnements de dev sans compte Befiana).
 *
 * Gestion corporate (achat groupé, 7 août 2026) — notifie le payeur par SMS
 * une fois son paiement groupé validé par un admin. Simple notification
 * post-paiement, pas une vérification OTP (aucune étape bloquante dans le
 * parcours) — voir confirmCompanyPayment.
 */
const BEFIANA_BASE_URL = "https://api.befiana.cloud/api/smsko/v1";

function getBefianaApiKey(): string {
  const apiKey = process.env.BEFIANA_API_KEY;
  if (!apiKey) {
    throw new Error("BEFIANA_API_KEY is not set — see .env.example");
  }
  return apiKey;
}

/**
 * Envoie un SMS via Befiana. `phoneNumber` doit être au format attendu par
 * Befiana (national, sans le préfixe pays — ex. "346255878", voir leur doc).
 * Ne fait aucune tentative de normalisation ici : c'est à l'appelant de
 * fournir un numéro déjà propre (voir lib/validations pour un futur schéma
 * de validation si ce besoin grandit).
 */
export async function sendSms(phoneNumber: string, message: string): Promise<void> {
  const apiKey = getBefianaApiKey();

  const res = await fetch(`${BEFIANA_BASE_URL}/send/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ phone_number: phoneNumber, message }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[befiana] failed to send SMS", { phoneNumber, status: res.status, body });
    throw new Error(`Failed to send SMS: ${res.status}`);
  }
}
