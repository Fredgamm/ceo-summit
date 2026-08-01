/**
 * Parcours revu (1er août 2026) — statut de dossier visible tout au long de
 * la mise en place, pour que l'utilisateur sache où il en est sans
 * solliciter l'équipe. Fonction pure (pas de Prisma ici) pour rester
 * testable sans base de données, même convention que lib/events-query.ts.
 *
 * Deux paires d'étapes se confirment au même moment dans ce modèle, pas de
 * simplification abusive : "Offre sélectionnée"/"Entreprise renseignée"
 * sont créées ensemble (voir app/actions/company.ts::createCompany), et
 * "Collaborateurs ajoutés"/"Invitations envoyées" aussi (inviteTeammate
 * envoie l'email immédiatement, il n'y a pas d'état "ajouté mais pas
 * encore invité" dans ce parcours).
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

  const paymentSubmitted =
    subscriptionStatus === "PENDING_REVIEW" || subscriptionStatus === "ACTIVE";
  const accessActive = subscriptionStatus === "ACTIVE";

  return [
    { key: "account", label: "Compte créé", done: true },
    { key: "plan", label: "Offre sélectionnée", done: hasCompany },
    { key: "company", label: "Entreprise renseignée", done: hasCompany },
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
