import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Messagerie » — à porter depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const MESSAGING_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "message-notification",
    category: "MESSAGING",
    label: "Notification de nouveau message",
    description:
      "Envoyé à un membre hors-ligne (pas de socket connecté) dans les 60s suivant réception d'un message de messagerie, avec aperçu du message et bouton pour répondre. Max 1 email par conversation par heure (anti-spam).",
    triggerHint: "server/offline-message-notifier.ts",
    variables: [
      { key: "senderName", label: "Nom de l'expéditeur", example: "Rabe Andriamahefa" },
      {
        key: "messagePreview",
        label: "Aperçu du message reçu",
        example: "Bonjour, je voulais revenir sur votre intérêt pour notre opportunité…",
      },
      {
        key: "conversationUrl",
        label: "Lien vers la conversation",
        example: "https://b2b.ceo-summit.mg/messagerie/conv_1",
      },
    ],
    defaultSubject: "Nouveau message de {{senderName}}",
    defaultBlocks: [
      { id: "heading", type: "heading", text: "Nouveau message de {{senderName}}" },
      { id: "preview", type: "paragraph", text: "\u201C{{messagePreview}}\u201D" },
      { id: "cta", type: "button", label: "Répondre", url: "{{conversationUrl}}" },
    ],
  },
];
