import type { VisitorSlotState } from "@/lib/meeting-participation";

/**
 * Module 21 (3 nov. 2026) — « Demander un rendez-vous » : l'entrée n'est plus
 * un onglet du profil mais un bouton de son en-tête, qui ouvre la page
 * `/membres/[id]/rendez-vous`. Règles pures de ce bouton et libellés des
 * créneaux, testés à part.
 */

export type MeetingCta =
  | { kind: "request"; label: string }
  /** Une demande ou un rendez-vous existe déjà avec ce membre (RG-10). */
  | { kind: "view"; label: string }
  | { kind: "complete-profile"; label: string }
  | { kind: "disabled"; label: string; reason: string };

/**
 * Ce que montre le bouton d'en-tête. L'ordre compte : une demande déjà en
 * cours prime (il n'y en a qu'une par couple, RG-10), puis le profil du
 * visiteur (téléphone obligatoire, RG-02), puis l'état du membre visité.
 */
export function meetingCta(input: {
  existingBooking: { status: "PENDING" | "CONFIRMED" } | null;
  viewerMissingFields: string[];
  memberUnavailable: boolean;
  hasFreeSlot: boolean;
}): MeetingCta {
  if (input.existingBooking) {
    return {
      kind: "view",
      label:
        input.existingBooking.status === "PENDING" ? "Voir ma demande" : "Voir mon rendez-vous",
    };
  }
  if (input.viewerMissingFields.length > 0) {
    return { kind: "complete-profile", label: "Compléter mon profil" };
  }
  if (input.memberUnavailable) {
    return {
      kind: "disabled",
      label: "Rendez-vous indisponible",
      reason: "Ce membre doit d'abord compléter son profil pour recevoir des demandes.",
    };
  }
  if (!input.hasFreeSlot) {
    return {
      kind: "disabled",
      label: "Aucun créneau libre",
      reason: "Ce membre n'a plus de créneau libre pour le moment.",
    };
  }
  return { kind: "request", label: "Demander un rendez-vous" };
}

/**
 * Un créneau libre se choisit d'un appui, sans étiquette. Les autres sont
 * grisés avec **un seul mot court** (pas de phrase qui déborde sur mobile).
 */
const SLOT_LABEL: Record<Exclude<VisitorSlotState, "available">, string> = {
  taken: "Réservé",
  inactive: "Inactif",
  "you-unavailable": "Occupé",
  past: "Passé",
};

export function visitorSlotLabel(state: VisitorSlotState): string | null {
  return state === "available" ? null : SLOT_LABEL[state];
}

/** Matin avant midi, après-midi ensuite, d'après l'heure affichée « 09h30 – 10h00 ». */
export function slotPeriod(range: string): "morning" | "afternoon" {
  return Number.parseInt(range.slice(0, 2), 10) < 12 ? "morning" : "afternoon";
}

/** Premier jour qui a un créneau libre ; à défaut, le premier jour. */
export function defaultDay(
  days: { key: string; slots: { state: VisitorSlotState }[] }[]
): string | null {
  const withFree = days.find((d) => d.slots.some((s) => s.state === "available"));
  return (withFree ?? days[0])?.key ?? null;
}

/**
 * Page « Prendre rendez-vous » (3 nov. 2026, refonte « simple comme bonjour ») :
 * trois étapes — quel jour, quelle heure, pourquoi — avec des motifs prêts à
 * choisir pour éviter de taper sur un téléphone.
 */
export const QUICK_REASONS = [
  {
    label: "Présenter mon entreprise",
    text: "Je souhaite vous présenter mon entreprise et mes services.",
  },
  { label: "Trouver un partenaire", text: "Je cherche un partenaire pour un projet commun." },
  { label: "Proposer une collaboration", text: "Je souhaite vous proposer une collaboration." },
  {
    label: "Faire connaissance",
    text: "J'aimerais faire connaissance et échanger sur notre secteur.",
  },
] as const;

/**
 * Clic sur un motif prêt à l'emploi : il remplace le champ s'il est vide ou ne
 * contient qu'un autre motif prêt à l'emploi, sinon il s'ajoute à la suite de ce
 * que la personne a écrit (jamais d'écrasement d'un texte saisi). Borné à `max`.
 */
export function applyQuickReason(current: string, text: string, max: number): string {
  const trimmed = current.trim();
  const isOnlyQuick = trimmed === "" || QUICK_REASONS.some((r) => r.text === trimmed);
  const next = isOnlyQuick ? text : `${trimmed} ${text}`;
  return next.slice(0, max);
}

/** Aide sous le champ du motif : dit ce qu'il manque au lieu de laisser un bouton grisé muet. */
export function reasonHint(length: number, min: number): string | null {
  if (length >= min) return null;
  const missing = min - length;
  return length === 0
    ? "Choisissez un motif ci-dessus, ou écrivez le vôtre."
    : `Encore ${missing} caractère${missing > 1 ? "s" : ""} pour pouvoir envoyer.`;
}

/** « lundi » et « 11 janvier » pour un jour « 2027-01-11 » (indépendant du fuseau de l'appareil). */
export function dayParts(dayKey: string): { weekday: string; date: string } {
  const noon = new Date(`${dayKey}T12:00:00Z`);
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" }).format(noon);
  return { weekday: fmt({ weekday: "long" }), date: fmt({ day: "numeric", month: "long" }) };
}

/** « 12 libres », « 1 libre » ou « Complet ». */
export function freeLabel(count: number): string {
  if (count === 0) return "Complet";
  return count === 1 ? "1 libre" : `${count} libres`;
}
