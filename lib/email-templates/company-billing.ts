import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Entreprise / paiement » — à porter depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const COMPANY_BILLING_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "company-admin-reassigned-new-admin",
    category: "COMPANY_BILLING",
    label: "Nouvel admin désigné (destinataire : nouvel admin)",
    description:
      "Envoyé au nouvel administrateur d'entreprise lorsque l'équipe CEO Summit lui transfère la gestion des paiements et des invitations de l'entreprise.",
    triggerHint: "app/actions/admin-companies.ts::reassignCompanyAdmin",
    variables: [
      { key: "memberName", label: "Nom du destinataire", example: "Jean-Pierre Rakoto" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
    ],
    defaultSubject: "Vous êtes désormais admin de {{companyName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Vous êtes désormais administrateur" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberName}}, l'équipe CEO Summit vous a désigné administrateur de l'entreprise **{{companyName}}**. Vous pouvez désormais gérer les paiements et inviter des collaborateurs depuis votre espace.",
      },
    ],
  },
  {
    key: "company-admin-reassigned-old-admin",
    category: "COMPANY_BILLING",
    label: "Nouvel admin désigné (destinataire : ancien admin)",
    description:
      "Envoyé à l'ancien administrateur d'entreprise lorsque l'équipe CEO Summit désigne un nouvel administrateur à sa place, pour l'informer qu'il perd la gestion des paiements et des invitations.",
    triggerHint: "app/actions/admin-companies.ts::reassignCompanyAdmin",
    variables: [
      { key: "memberName", label: "Nom du destinataire", example: "Jean-Pierre Rakoto" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
    ],
    defaultSubject: "Changement d'admin — {{companyName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Changement d'administrateur" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberName}}, l'équipe CEO Summit a désigné un nouvel administrateur pour **{{companyName}}**. Vous ne gérez plus les paiements ni les invitations de cette entreprise.",
      },
    ],
  },
  {
    key: "company-admin-welcome",
    category: "COMPANY_BILLING",
    label: "Bienvenue gestionnaire entreprise",
    description:
      "Envoyé au gestionnaire à la création de son compte et de la fiche entreprise (avant tout paiement), pour lui rappeler l'étape suivante : payer.",
    triggerHint: "app/actions/company-account.ts::createCompanyAccount",
    variables: [
      { key: "adminName", label: "Nom du gestionnaire", example: "Jean-Pierre Rakoto" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      { key: "planName", label: "Nom de l'offre", example: "Pack Entreprise" },
      {
        key: "paymentUrl",
        label: "Lien de paiement",
        example: "https://app.ceo-summit.mg/entreprise/paiement",
      },
    ],
    defaultSubject: "Votre compte CEO Summit est créé — {{companyName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Bienvenue, {{adminName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Votre compte gestionnaire et la fiche de **{{companyName}}** sont créés sur CEO Summit, avec l'offre **{{planName}}**.",
      },
      {
        id: "3",
        type: "paragraph",
        text: "Prochaine étape : le paiement. Une fois votre paiement validé par l'équipe CEO Summit, vous pourrez inviter vos collaborateurs et composer la liste des participants.",
      },
      { id: "4", type: "button", label: "Procéder au paiement", url: "{{paymentUrl}}" },
    ],
  },
  {
    key: "company-payment-received",
    category: "COMPANY_BILLING",
    label: "Paiement entreprise reçu, en vérification",
    description:
      "Envoyé à l'administrateur de l'entreprise quand il envoie sa preuve de paiement (virement ou chèque) : le paiement est reçu et en cours de vérification par l'équipe CEO Summit.",
    triggerHint: "app/actions/company-subscription.ts::submitPaymentProof",
    variables: [
      { key: "adminName", label: "Nom de l'administrateur", example: "Jean-Pierre Rakoto" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      { key: "amount", label: "Montant (déjà formaté)", example: "50 000 € (soit 248 200 000 Ar)" },
      { key: "method", label: "Mode de paiement", example: "Virement bancaire" },
    ],
    defaultSubject: "Paiement reçu — en cours de vérification",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Merci, {{adminName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Nous avons bien reçu votre paiement de **{{amount}}** ({{method}}) pour **{{companyName}}**. Il est en cours de vérification par l'équipe CEO Summit.",
      },
      {
        id: "3",
        type: "paragraph",
        text: "Vous recevrez un e-mail dès sa validation : l'accès à la plateforme s'activera alors pour vous et vos collaborateurs.",
      },
      {
        id: "4",
        type: "button",
        label: "Suivre mon paiement",
        url: "https://app.ceo-summit.mg/paiement-en-attente",
      },
    ],
  },
  {
    key: "company-payment-confirmed",
    category: "COMPANY_BILLING",
    label: "Paiement entreprise confirmé",
    description:
      "Envoyé à l'administrateur de l'entreprise quand son paiement initial est validé par l'équipe CEO Summit — l'accès à la plateforme devient actif.",
    triggerHint: "lib/payment-confirmations.ts::confirmCompanyPaymentCore",
    variables: [
      { key: "adminName", label: "Nom de l'administrateur", example: "Jean-Pierre Rakoto" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      {
        key: "loginUrl",
        label: "Lien de connexion (ouvre la gestion de l'entreprise)",
        example: "https://app.ceo-summit.mg/login?callbackUrl=%2Fentreprises%2Fabc%3Ftab%3Dgestion",
      },
    ],
    defaultSubject: "Paiement confirmé — {{companyName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Paiement confirmé, {{adminName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Le paiement de **{{companyName}}** a été validé — l'accès à la plateforme est maintenant actif pour vous et tous vos collaborateurs.",
      },
      {
        id: "3",
        type: "paragraph",
        text: "Connectez-vous pour désigner les participants à l'événement et inviter vos collaborateurs.",
      },
      { id: "4", type: "button", label: "Me connecter", url: "{{loginUrl}}" },
    ],
  },
  {
    key: "company-payment-rejected",
    category: "COMPANY_BILLING",
    label: "Paiement entreprise à corriger",
    description:
      "Envoyé à l'administrateur de l'entreprise quand son paiement (initial ou supplément de places) est refusé, avec le motif à corriger pour ressoumettre.",
    triggerHint: "app/actions/admin-companies.ts::rejectCompanyPayment",
    variables: [
      { key: "adminName", label: "Nom de l'administrateur", example: "Jean-Pierre Rakoto" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      { key: "reason", label: "Motif du refus", example: "Preuve illisible" },
    ],
    defaultSubject: "Paiement à corriger — {{companyName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Un correctif est nécessaire, {{adminName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Le paiement soumis pour **{{companyName}}** n'a pas pu être validé :",
      },
      { id: "3", type: "paragraph", text: "{{reason}}" },
      {
        id: "4",
        type: "button",
        label: "Soumettre un nouveau paiement",
        url: "https://app.ceo-summit.mg/entreprise/paiement",
      },
    ],
  },
  {
    key: "company-upsell-confirmed",
    category: "COMPANY_BILLING",
    label: "Supplément de places confirmé",
    description:
      "Envoyé à l'administrateur de l'entreprise quand son paiement pour des places supplémentaires (upsell) est validé.",
    triggerHint: "lib/payment-confirmations.ts::confirmCompanyPaymentCore",
    variables: [
      { key: "adminName", label: "Nom de l'administrateur", example: "Jean-Pierre Rakoto" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      { key: "planName", label: "Nom de l'offre", example: "Executive Pass" },
      { key: "quantity", label: "Nombre de places", example: "1" },
    ],
    defaultSubject: "Supplément confirmé — {{companyName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Supplément confirmé, {{adminName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Votre paiement pour **{{quantity}}** place(s) supplémentaire(s) — **{{planName}}** — a été validé pour **{{companyName}}**. Ces place(s) sont disponibles dès maintenant : rendez-vous dans l'espace de votre entreprise pour inviter vos collaborateurs.",
      },
    ],
  },
  {
    key: "event-payment-reminder",
    category: "COMPANY_BILLING",
    label: "Relance paiement événement",
    description:
      "Envoyé au membre inscrit à un événement dont le paiement (virement/mobile money) est en attente, sur action manuelle « Relancer » de l'admin.",
    triggerHint: "app/actions/admin-finance.ts::sendEventPaymentReminder",
    variables: [
      { key: "memberName", label: "Nom du membre", example: "Fatima Said" },
      { key: "eventTitle", label: "Titre de l'événement", example: "CEO Summit 2026 — La Réunion" },
      { key: "amount", label: "Montant dû (déjà formaté)", example: "1 500 000 Ar" },
    ],
    defaultSubject: "Paiement en attente — {{eventTitle}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Paiement en attente — {{eventTitle}}" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberName}}, nous n'avons pas encore reçu confirmation de votre paiement de **{{amount}}** pour **{{eventTitle}}**. Votre badge sera activé dès réception. Merci de vérifier que votre virement ou paiement mobile a bien été initié.",
      },
    ],
  },
];
