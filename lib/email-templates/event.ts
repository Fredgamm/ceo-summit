import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Évènement » — à porter depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 *
 * Porté depuis `emails/event-registration-email.tsx`, qui a un booléen
 * `requiresManualValidation` changeant un paragraphe entier selon le mode de
 * paiement. Scindé en deux clés (pas de bloc conditionnel dans ce registre) :
 * "event-registration" (chemin normal) et
 * "event-registration-pending-payment" (virement en attente de validation).
 *
 * Les 3 sites d'appel réels (grep `event-registration-email`) :
 * - `app/actions/events.ts::registerForEvent` — envoie l'une ou l'autre clé
 *   selon `requiresManualValidation: method === "VIREMENT"` (sujet réel :
 *   `Inscription confirmée — ${event.title}`).
 * - `app/actions/company-invites.ts::sendEventRegistrationEmail` (appelée
 *   par `setAdminParticipates` et `acceptCompanyInvite`) — toujours
 *   `requiresManualValidation: false`, donc toujours "event-registration"
 *   (même sujet : `Inscription confirmée — ${event.title}`).
 * - `lib/payment-confirmations.ts::confirmEventRegistrationPaymentCore` —
 *   toujours `requiresManualValidation: false`, donc toujours
 *   "event-registration", mais avec un sujet réellement différent :
 *   `Paiement confirmé — ${registration.event.title}` (confirmation admin/
 *   webhook d'un virement déjà reçu). `defaultSubject` ci-dessous reprend le
 *   sujet majoritaire (2 sites sur 3) ; ce 3e site enverra un sujet distinct
 *   tant qu'il ne sera pas migré vers ce registre.
 */
export const EVENT_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "event-registration",
    category: "EVENT",
    label: "Inscription confirmée",
    description:
      "Envoyé au membre juste après l'enregistrement de son inscription à un évènement (paiement Mobile Money, ou aucun paiement requis), ou après confirmation manuelle/webhook d'un paiement par virement déjà reçu.",
    triggerHint:
      "app/actions/events.ts::registerForEvent (paymentMethod MOBILE_MONEY) ; app/actions/company-invites.ts::sendEventRegistrationEmail (setAdminParticipates, acceptCompanyInvite) ; lib/payment-confirmations.ts::confirmEventRegistrationPaymentCore",
    variables: [
      { key: "memberName", label: "Nom du membre", example: "Jean-Pierre Rakoto" },
      {
        key: "eventTitle",
        label: "Titre de l'évènement",
        example: "CEO Summit 2026 — La Réunion",
      },
      {
        key: "eventDateLabel",
        label: "Date de l'évènement (libellé)",
        example: "15–16 novembre 2026",
      },
      { key: "eventLocation", label: "Lieu de l'évènement", example: "Saint-Denis, La Réunion" },
    ],
    defaultSubject: "Inscription confirmée — {{eventTitle}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Merci, {{memberName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Votre inscription au **{{eventTitle}}** – {{eventDateLabel}}, {{eventLocation}} – a bien été enregistrée.",
      },
      {
        id: "3",
        type: "paragraph",
        text: "Retrouvez les détails de votre inscription à tout moment depuis votre espace CEO Summit.",
      },
      { id: "4", type: "paragraph", text: "À bientôt au {{eventTitle}} !" },
    ],
  },
  {
    key: "event-registration-pending-payment",
    category: "EVENT",
    label: "Inscription — virement en attente",
    description:
      "Envoyé au membre juste après l'enregistrement de son inscription à un évènement payée par virement bancaire : le paragraphe central diffère de la variante normale pour signaler que le paiement est en cours de validation par l'équipe, au lieu de renvoyer vers le tableau de bord.",
    triggerHint: "app/actions/events.ts::registerForEvent (paymentMethod VIREMENT)",
    variables: [
      { key: "memberName", label: "Nom du membre", example: "Jean-Pierre Rakoto" },
      {
        key: "eventTitle",
        label: "Titre de l'évènement",
        example: "CEO Summit 2026 — La Réunion",
      },
      {
        key: "eventDateLabel",
        label: "Date de l'évènement (libellé)",
        example: "15–16 novembre 2026",
      },
      { key: "eventLocation", label: "Lieu de l'évènement", example: "Saint-Denis, La Réunion" },
    ],
    defaultSubject: "Inscription confirmée — {{eventTitle}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Merci, {{memberName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Votre inscription au **{{eventTitle}}** – {{eventDateLabel}}, {{eventLocation}} – a bien été enregistrée.",
      },
      {
        id: "3",
        type: "paragraph",
        text: "Votre paiement par virement est en cours de validation par l'équipe CEO Summit. Vous recevrez une confirmation dès validation.",
      },
      { id: "4", type: "paragraph", text: "À bientôt au {{eventTitle}} !" },
    ],
  },
];
