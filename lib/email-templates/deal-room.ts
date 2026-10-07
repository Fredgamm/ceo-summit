import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Deal Room » — à porter depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const DEAL_ROOM_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "opportunity-approved",
    category: "DEAL_ROOM",
    label: "Opportunité publiée",
    description:
      "Envoyé à l'auteur d'une opportunité Deal Room quand un admin la valide et la publie.",
    triggerHint: "app/actions/admin-deal-room.ts::approveOpportunity",
    variables: [
      {
        key: "opportunityTitle",
        label: "Titre de l'opportunité",
        example: "Partenariat distribution solaire — Nord Madagascar",
      },
      {
        key: "opportunityUrl",
        label: "Lien vers l'opportunité",
        example: "https://app.ceo-summit.mg/deal-room/opp_1",
      },
    ],
    defaultSubject: 'Votre opportunité "{{opportunityTitle}}" est publiée',
    defaultBlocks: [
      { id: "1", type: "heading", text: "Votre opportunité est publiée" },
      {
        id: "2",
        type: "paragraph",
        text: "**{{opportunityTitle}}** est maintenant visible dans le Deal Room CEO Summit.",
      },
      { id: "3", type: "button", label: "Voir mon opportunité", url: "{{opportunityUrl}}" },
    ],
  },
  {
    key: "opportunity-changes-requested",
    category: "DEAL_ROOM",
    label: "Modifications demandées",
    description:
      "Envoyé à l'auteur d'une opportunité Deal Room quand un admin demande des modifications avant republication (message libre rédigé par l'admin).",
    triggerHint: "app/actions/admin-deal-room.ts::requestOpportunityChanges",
    variables: [
      {
        key: "opportunityTitle",
        label: "Titre de l'opportunité",
        example: "Partenariat distribution solaire — Nord Madagascar",
      },
      {
        key: "message",
        label: "Message de l'admin",
        example: "Merci de préciser le budget et l'échéance de candidature avant republication.",
      },
    ],
    defaultSubject: "Modifications demandées — {{opportunityTitle}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Modifications demandées — {{opportunityTitle}}" },
      { id: "2", type: "paragraph", text: "{{message}}" },
      {
        id: "3",
        type: "paragraph",
        text: "Vous pouvez soumettre une nouvelle version de votre opportunité à tout moment.",
      },
    ],
  },
  {
    key: "opportunity-contact-accepted",
    category: "DEAL_ROOM",
    label: "Demande de contact acceptée",
    description:
      "Envoyé à l'initiateur d'une demande de contact Deal Room quand le destinataire l'accepte ; la conversation est déjà créée à ce moment-là.",
    triggerHint: "app/actions/deal-room.ts::acceptOpportunityContact",
    variables: [
      { key: "receiverName", label: "Nom du destinataire", example: "Jean-Pierre Rakoto" },
      {
        key: "opportunityTitle",
        label: "Titre de l'opportunité",
        example: "Partenariat distribution solaire — Nord Madagascar",
      },
      {
        key: "conversationUrl",
        label: "Lien vers la conversation",
        example: "https://app.ceo-summit.mg/messagerie/conv_1",
      },
    ],
    defaultSubject: "Demande de contact acceptée — {{opportunityTitle}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Demande de contact acceptée" },
      {
        id: "2",
        type: "paragraph",
        text: "**{{receiverName}}** a accepté votre demande de contact au sujet de l'opportunité **{{opportunityTitle}}**. Une conversation a été créée — vous pouvez échanger directement dès maintenant.",
      },
      { id: "3", type: "button", label: "Ouvrir la conversation", url: "{{conversationUrl}}" },
    ],
  },
  {
    key: "opportunity-contact-request",
    category: "DEAL_ROOM",
    label: "Nouvelle demande de contact",
    description:
      "Envoyé à l'auteur d'une opportunité Deal Room quand un autre membre souhaite le contacter et attend sa décision.",
    triggerHint: "app/actions/deal-room.ts::contactOpportunityAuthor",
    variables: [
      { key: "initiatorName", label: "Nom de l'initiateur", example: "Jean-Pierre Rakoto" },
      {
        key: "opportunityTitle",
        label: "Titre de l'opportunité",
        example: "Partenariat distribution solaire — Nord Madagascar",
      },
      {
        key: "opportunityUrl",
        label: "Lien vers l'opportunité",
        example: "https://app.ceo-summit.mg/deal-room/opp_1",
      },
    ],
    defaultSubject: "Nouvelle demande de contact — {{opportunityTitle}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Nouvelle demande de contact" },
      {
        id: "2",
        type: "paragraph",
        text: "**{{initiatorName}}** souhaite vous contacter au sujet de votre opportunité **{{opportunityTitle}}**. Acceptez la demande pour démarrer une conversation directe avec ce membre.",
      },
      { id: "3", type: "button", label: "Voir la demande", url: "{{opportunityUrl}}" },
    ],
  },
  {
    key: "opportunity-refused",
    category: "DEAL_ROOM",
    label: "Opportunité refusée",
    description:
      "Envoyé à l'auteur d'une opportunité Deal Room quand un admin refuse sa publication ; contrairement au refus de candidature, le motif est bien transmis ici.",
    triggerHint: "app/actions/admin-deal-room.ts::rejectOpportunity",
    variables: [
      {
        key: "opportunityTitle",
        label: "Titre de l'opportunité",
        example: "Partenariat distribution solaire — Nord Madagascar",
      },
      {
        key: "reason",
        label: "Motif du refus",
        example: "Informations insuffisantes sur le profil de partenaire recherché.",
      },
    ],
    defaultSubject: 'Votre opportunité "{{opportunityTitle}}" n\'a pas été retenue',
    defaultBlocks: [
      { id: "1", type: "heading", text: "Votre opportunité n'a pas été retenue" },
      {
        id: "2",
        type: "paragraph",
        text: "Après examen, **{{opportunityTitle}}** n'a pas été retenue pour publication dans le Deal Room CEO Summit.",
      },
      { id: "3", type: "paragraph", text: "{{reason}}" },
      {
        id: "4",
        type: "paragraph",
        text: "Vous pouvez soumettre une nouvelle opportunité à tout moment.",
      },
    ],
  },
];
