import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Services » — à porter depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const SERVICES_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "service-listing-approved",
    category: "SERVICES",
    label: "Fiche service approuvée",
    description:
      "Envoyé à l'auteur d'une fiche service quand un admin l'approuve et la publie au catalogue de services.",
    triggerHint: "app/actions/admin-services.ts::approveServiceListing",
    variables: [
      {
        key: "serviceTitle",
        label: "Titre de la fiche service",
        example: "Audit stratégique & accompagnement levée de fonds",
      },
      {
        key: "serviceUrl",
        label: "Lien vers la fiche publiée",
        example: "https://b2b.ceo-summit.mg/catalogue/services/svc_1",
      },
    ],
    defaultSubject: 'Votre fiche "{{serviceTitle}}" est publiée',
    defaultBlocks: [
      { id: "1", type: "heading", text: "Votre fiche service est publiée" },
      {
        id: "2",
        type: "paragraph",
        text: "**{{serviceTitle}}** est maintenant visible dans le catalogue de services CEO Summit.",
      },
      { id: "3", type: "button", label: "Voir ma fiche", url: "{{serviceUrl}}" },
    ],
  },
  {
    key: "service-listing-refused",
    category: "SERVICES",
    label: "Fiche service refusée",
    description:
      "Envoyé à l'auteur d'une fiche service quand un admin la refuse. Ne contient volontairement aucun motif (même logique RG que le refus de candidature : le motif interne n'est jamais communiqué).",
    triggerHint: "app/actions/admin-services.ts::rejectServiceListing",
    variables: [
      {
        key: "serviceTitle",
        label: "Titre de la fiche service",
        example: "Audit stratégique & accompagnement levée de fonds",
      },
    ],
    defaultSubject: 'Votre fiche "{{serviceTitle}}" n\'a pas été retenue',
    defaultBlocks: [
      { id: "1", type: "heading", text: "Votre fiche service n'a pas été retenue" },
      {
        id: "2",
        type: "paragraph",
        text: "Après examen, votre fiche **{{serviceTitle}}** n'a pas été retenue pour publication dans le catalogue de services CEO Summit. Vous pouvez soumettre une nouvelle fiche à tout moment.",
      },
    ],
  },
];
