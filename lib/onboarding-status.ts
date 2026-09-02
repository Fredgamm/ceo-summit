/**
 * Parcours revu (1er août 2026) — statut de dossier visible tout au long de
 * la mise en place, pour que l'utilisateur sache où il en est sans
 * solliciter l'équipe. Fonction pure (pas de Prisma ici) pour rester
 * testable sans base de données, même convention que lib/events-query.ts.
 *
 * "Collaborateurs ajoutés"/"Invitations envoyées" se confirment au même
 * moment dans ce modèle, pas une simplification abusive (inviteTeammate
 * envoie l'email immédiatement, il n'y a pas d'état "ajouté mais pas encore
 * invité" dans ce parcours).
 *
 * "Offre sélectionnée" et "Entreprise renseignée" ne sont PLUS le même
 * instant depuis le 5 août 2026 (ordre inversé : l'entreprise se crée sans
 * offre, l'offre se choisit après sur `/entreprise/paiement`) — "Offre
 * sélectionnée" dépend donc de `subscriptionStatus`, pas de `hasCompany`.
 */

export type CompanySubscriptionStatusLike =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PENDING_REVIEW"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELLED"
  | null
  | undefined;

export interface OnboardingStatusInput {
  hasCompany: boolean;
  hasInvites: boolean;
  subscriptionStatus: CompanySubscriptionStatusLike;
}

export interface OnboardingStatusItem {
  key: string;
  label: string;
  done: boolean;
}

export function getOnboardingStatus(input: OnboardingStatusInput): OnboardingStatusItem[] {
  const { hasCompany, hasInvites, subscriptionStatus } = input;

  // Correctif (refactor dette technique, sept. 2026) — audit du 7 août :
  // "getOnboardingStatus n'applique pas la règle RG-12 ('EXPIRED compte
  // comme ACTIVE')" — seul l'accès à l'édition d'évènement expire
  // (lib/company-subscription-status.ts), les avantages plateforme
  // persistent, comme déjà traité par getViewerTierFromCompany
  // (lib/plan-access.ts). Sans ce correctif, une entreprise à l'accès
  // pleinement actif voyait sa checklist prétendre le contraire dès que le
  // statut brut passait à EXPIRED.
  const accessActive = subscriptionStatus === "ACTIVE" || subscriptionStatus === "EXPIRED";
  const paymentSubmitted = subscriptionStatus === "PENDING_REVIEW" || accessActive;
  const planSelected = subscriptionStatus != null && subscriptionStatus !== "DRAFT";

  return [
    { key: "account", label: "Compte créé", done: true },
    { key: "company", label: "Entreprise renseignée", done: hasCompany },
    { key: "plan", label: "Offre sélectionnée", done: planSelected },
    { key: "collaborators", label: "Collaborateurs ajoutés", done: hasInvites },
    { key: "payment_submitted", label: "Paiement soumis", done: paymentSubmitted },
    {
      key: "admin_review",
      label: "Vérification par l'administration",
      done: paymentSubmitted,
    },
    { key: "payment_validated", label: "Paiement validé", done: accessActive },
    { key: "access_active", label: "Accès activé", done: accessActive },
    { key: "invitations_sent", label: "Invitations envoyées aux collaborateurs", done: hasInvites },
  ];
}
