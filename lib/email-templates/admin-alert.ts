import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Alertes internes admin » — à porter depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const ADMIN_ALERT_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "admin-company-payment-alert",
    category: "ADMIN_ALERT",
    label: "Paiement entreprise à valider",
    description:
      "Alerte l'admin quand une entreprise soumet une preuve de paiement (offre initiale ou supplément de sièges) à valider manuellement.",
    triggerHint: "app/actions/company-subscription.ts::submitPaymentProof, purchaseUpsellSeats",
    variables: [
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      { key: "method", label: "Méthode de paiement", example: "virement bancaire" },
      { key: "amount", label: "Montant déclaré", example: "5 000 000 Ar" },
    ],
    defaultSubject: "Paiement entreprise à valider — {{companyName}}",
    defaultBlocks: [
      { id: "h1", type: "heading", text: "Paiement entreprise à valider" },
      {
        id: "p1",
        type: "paragraph",
        text: "**{{companyName}}** a soumis une preuve de paiement par {{method}}.",
      },
      {
        id: "p2",
        type: "paragraph",
        text: "Montant déclaré : **{{amount}}**. Vérifier la preuve et valider depuis le back-office (/admin/entreprises).",
      },
    ],
  },
  {
    key: "admin-event-payment-alert",
    category: "ADMIN_ALERT",
    label: "Virement événement à valider",
    description:
      "Alerte l'admin quand un membre s'inscrit à un événement en choisissant le paiement par virement, à valider manuellement une fois le virement confirmé.",
    triggerHint: "app/actions/events.ts::registerForEvent",
    variables: [
      { key: "memberName", label: "Nom du membre", example: "Jean-Pierre Rakoto" },
      { key: "memberEmail", label: "Email du membre", example: "jp.rakoto@techocean.mg" },
      { key: "eventTitle", label: "Titre de l'événement", example: "CEO Summit 2026 — La Réunion" },
      { key: "amount", label: "Montant attendu", example: "1 500 000 Ar" },
    ],
    defaultSubject: "Virement à valider — {{eventTitle}}",
    defaultBlocks: [
      { id: "h1", type: "heading", text: "Virement à valider manuellement" },
      {
        id: "p1",
        type: "paragraph",
        text: "**{{memberName}}** ({{memberEmail}}) s'est inscrit(e) à **{{eventTitle}}** et a choisi le paiement par virement bancaire.",
      },
      {
        id: "p2",
        type: "paragraph",
        text: "Montant attendu : **{{amount}}**. Valider la réception depuis le back-office une fois le virement confirmé.",
      },
    ],
  },
  {
    key: "admin-opportunity-alert",
    category: "ADMIN_ALERT",
    label: "Opportunité Deal Room à modérer",
    description:
      "Alerte l'admin quand un membre soumet (ou resoumet) une opportunité Deal Room, en attente de validation avant publication.",
    triggerHint: "app/actions/deal-room.ts::publishOpportunity, resubmitOpportunity",
    variables: [
      { key: "authorName", label: "Nom de l'auteur", example: "Jean-Pierre Rakoto" },
      {
        key: "opportunityTitle",
        label: "Titre de l'opportunité",
        example: "Recherche partenaire logistique — Nord Madagascar",
      },
    ],
    defaultSubject: "Nouvelle opportunité à modérer — {{opportunityTitle}}",
    defaultBlocks: [
      { id: "h1", type: "heading", text: "Nouvelle opportunité Deal Room à modérer" },
      {
        id: "p1",
        type: "paragraph",
        text: "**{{authorName}}** a soumis **{{opportunityTitle}}** pour publication. Elle est en attente de validation dans le back-office.",
      },
    ],
  },
  {
    key: "admin-room-report-alert",
    category: "ADMIN_ALERT",
    label: "Message signalé dans une salle",
    description:
      "Alerte l'admin quand un membre signale un message dans une salle Deal Room, en attente de traitement dans le back-office.",
    triggerHint: "app/actions/rooms.ts::reportRoomMessage",
    variables: [
      { key: "reporterName", label: "Nom du membre signalant", example: "Jean-Pierre Rakoto" },
      { key: "roomName", label: "Nom de la salle", example: "Énergie & Environnement" },
    ],
    defaultSubject: "Message signalé — {{roomName}}",
    defaultBlocks: [
      { id: "h1", type: "heading", text: "Message signalé — salle {{roomName}}" },
      {
        id: "p1",
        type: "paragraph",
        text: "**{{reporterName}}** a signalé un message dans la salle **{{roomName}}**. Il est en attente de traitement dans le back-office.",
      },
    ],
  },
  {
    key: "admin-service-listing-alert",
    category: "ADMIN_ALERT",
    label: "Fiche service à modérer",
    description:
      "Alerte l'admin quand un membre soumet une fiche service pour publication dans le catalogue, en attente de validation.",
    triggerHint: "app/actions/services.ts::submitServiceListing",
    variables: [
      { key: "authorName", label: "Nom de l'auteur", example: "Jean-Pierre Rakoto" },
      {
        key: "serviceTitle",
        label: "Titre de la fiche service",
        example: "Audit stratégique & accompagnement levée de fonds",
      },
    ],
    defaultSubject: "Nouvelle fiche service à modérer — {{serviceTitle}}",
    defaultBlocks: [
      { id: "h1", type: "heading", text: "Nouvelle fiche service à modérer" },
      {
        id: "p1",
        type: "paragraph",
        text: "**{{authorName}}** a soumis **{{serviceTitle}}** pour publication dans le catalogue de services. Elle est en attente de validation dans le back-office.",
      },
    ],
  },
];
