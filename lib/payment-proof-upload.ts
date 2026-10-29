import {
  COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES,
  COMPANY_PAYMENT_PROOF_MAX_BYTES,
} from "@/lib/validations/company-payment";

/**
 * 29 oct. 2026 — envoi de la preuve de paiement (virement, chèque), partagé
 * par PaymentProofForm et UpsellPurchaseForm. Une entreprise avait viré sans
 * qu'aucune preuve n'arrive : un échec d'envoi (fichier refusé par le proxy,
 * réponse non JSON, coupure réseau) levait une exception dans le formulaire
 * sans afficher le moindre message. Le fichier est désormais vérifié avant
 * l'envoi, et chaque échec se traduit par un message lisible.
 */

/** Pour l'attribut `accept` du champ fichier — formats réellement acceptés, pas `image/*`. */
export const PAYMENT_PROOF_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp," + COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES.join(",");

export const PAYMENT_PROOF_MAX_MB = COMPANY_PAYMENT_PROOF_MAX_BYTES / (1024 * 1024);

/** Consigne affichée sous la zone d'envoi. */
export const PAYMENT_PROOF_HINT = `PDF, JPG, PNG ou WEBP — ${PAYMENT_PROOF_MAX_MB} Mo maximum.`;

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"];

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`
    : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/** Message d'erreur si le fichier ne peut pas être accepté, sinon `null`. */
export function checkPaymentProofFile(file: File): string | null {
  if (file.size === 0) {
    return "Ce fichier est vide. Choisissez à nouveau votre preuve de paiement.";
  }
  if (file.size > COMPANY_PAYMENT_PROOF_MAX_BYTES) {
    return `Fichier trop lourd (${formatSize(file.size)}) : ${PAYMENT_PROOF_MAX_MB} Mo maximum. Réduisez sa taille (capture d'écran, PDF compressé) puis réessayez.`;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "heic" || extension === "heif" || /hei[cf]/.test(file.type)) {
    return "Les photos iPhone (HEIC) ne sont pas acceptées. Envoyez une capture d'écran du reçu, ou exportez la photo en JPG.";
  }
  const typeAllowed = COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES.includes(file.type);
  if (!typeAllowed && !ALLOWED_EXTENSIONS.includes(extension)) {
    return `Format non accepté (${extension ? `.${extension}` : "inconnu"}). ${PAYMENT_PROOF_HINT}`;
  }
  return null;
}

export type UploadedProof = { key: string; name: string };

/** Vérifie puis envoie le fichier ; ne lève jamais d'exception. */
export async function uploadPaymentProof(
  file: File
): Promise<{ ok: true; proof: UploadedProof } | { ok: false; error: string }> {
  const invalid = checkPaymentProofFile(file);
  if (invalid) return { ok: false, error: invalid };

  let res: Response;
  try {
    const formData = new FormData();
    formData.append("file", file);
    res = await fetch("/api/company/payment-proof", { method: "POST", body: formData });
  } catch {
    return {
      ok: false,
      error: "Envoi interrompu — vérifiez votre connexion internet puis réessayez.",
    };
  }

  // Une erreur du proxy (413, 502…) renvoie une page HTML, pas du JSON.
  const json: { data?: UploadedProof; error?: string } | null = await res.json().catch(() => null);

  if (res.ok && json?.data) return { ok: true, proof: json.data };
  if (res.status === 413) {
    return {
      ok: false,
      error: `Fichier trop lourd pour être envoyé : ${PAYMENT_PROOF_MAX_MB} Mo maximum. Réduisez sa taille puis réessayez.`,
    };
  }
  if (res.status === 401) {
    return { ok: false, error: "Votre session a expiré — reconnectez-vous puis réessayez." };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: json?.error ?? "Trop d'envois en peu de temps — patientez une minute puis réessayez.",
    };
  }
  return {
    ok: false,
    error:
      json?.error ??
      "L'envoi du fichier a échoué. Réessayez ; si le problème persiste, envoyez votre preuve à l'équipe CEO Summit par e-mail.",
  };
}
