import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActivePlans, getPlanBySlug } from "@/lib/plans-query";
import { PaymentProofForm } from "@/components/entreprise/payment-proof-form";
import { PlanPicker } from "@/components/entreprise/plan-picker";
import { OnboardingHeader } from "@/components/onboarding/onboarding-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary } from "@/lib/utils";

export const metadata: Metadata = { title: "Paiement" };

/**
 * Phase 2 offres/paiement (30 juillet 2026), fusionné avec l'ancien
 * /entreprise/abonnement le 4 août 2026 (RG-11) — un seul écran pour choisir
 * une offre, la payer, et en changer librement tant que l'abonnement n'est
 * pas ACTIVE (y compris après soumission d'une preuve : selectPlan invalide
 * alors la preuve précédente et repasse le dossier en PENDING_PAYMENT).
 *
 * `?offre=<slug>` (5 août 2026, ordre inversé entreprise/offre) — porté
 * depuis `/entreprise/creer` (lien profond évènement) ou résolu depuis
 * `User.intendedPlanId` (choisi avant l'inscription, site public) : ne
 * fait que présélectionner visuellement l'offre dans `PlanPicker`, aucune
 * écriture avant que l'utilisateur ne confirme son choix.
 */
export default async function CompanyPaymentPage({
  searchParams,
}: {
  searchParams: { offre?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (!viewer.companyId) redirect("/entreprise/creer");

  const [company, plans, deepLinkedPlan] = await Promise.all([
    prisma.company.findUnique({
      where: { id: viewer.companyId },
      include: {
        subscription: { include: { plan: true } },
        users: { select: { id: true } },
      },
    }),
    getActivePlans({ selfServiceOnly: true }),
    searchParams.offre ? getPlanBySlug(searchParams.offre) : null,
  ]);
  if (!company) redirect("/entreprise/creer");
  if (company.companyAdminId !== viewer.id) redirect(`/entreprises/${company.id}`);
  if (company.subscription?.status === "ACTIVE") redirect(`/entreprises/${company.id}`);

  const subscription = company.subscription;
  const headcount = company.users.length;

  // Une offre d'évènement (Phase 2quater) n'apparaît pas dans la liste
  // standard (getActivePlans filtre eventId: null par défaut) — on
  // l'ajoute explicitement si c'est elle qui est visée par le lien profond.
  const allPlans =
    deepLinkedPlan && !plans.some((p) => p.id === deepLinkedPlan.id)
      ? [deepLinkedPlan, ...plans]
      : plans;
  const resolvedInitialPlanId = deepLinkedPlan ? deepLinkedPlan.id : viewer.intendedPlanId;
  const initialPlanId = allPlans.some((p) => p.id === resolvedInitialPlanId)
    ? resolvedInitialPlanId
    : null;

  return (
    <div className="flex flex-col items-center">
      <OnboardingHeader backHref="/paiement-en-attente" />
      <div className="mx-auto max-w-4xl p-6">
        {subscription ? (
          <>
            <h1 className="mb-1 text-xl font-bold text-navy">
              Paiement — {subscription.plan.name}
            </h1>
            <p className="mb-4 text-sm text-text-muted">
              {formatAriary(subscription.plan.priceAr)}
              {subscription.plan.pricingMode === "FIXED_BUNDLE"
                ? ` — forfait ${subscription.plan.includedSeats ?? "?"} sièges`
                : " / participant / an"}
              . Choisissez votre mode de paiement, uploadez une preuve (bordereau, reçu, capture) —
              l&apos;équipe CEO Summit valide manuellement chaque paiement.
            </p>

            {subscription.status === "PENDING_REVIEW" && (
              <Alert className="mb-4">
                <AlertDescription>
                  Votre paiement est en cours de validation par l&apos;équipe CEO Summit —
                  l&apos;accès de votre équipe s&apos;activera dès confirmation.
                </AlertDescription>
              </Alert>
            )}

            {subscription.status === "PENDING_PAYMENT" && (
              <div className="mb-8 max-w-lg">
                <PaymentProofForm
                  companySubscriptionId={subscription.id}
                  priceAr={subscription.plan.priceAr}
                  minParticipants={subscription.plan.minParticipants}
                  pricingMode={subscription.plan.pricingMode}
                  includedSeats={subscription.plan.includedSeats}
                  headcount={headcount}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-bold text-navy">Choisir une offre</h1>
            <p className="mb-4 text-sm text-text-muted">
              Pour {company.name} — l&apos;accès de toute l&apos;équipe s&apos;active une fois le
              paiement confirmé.
            </p>
          </>
        )}

        {subscription?.status !== "PENDING_REVIEW" && (
          <div className={subscription ? "border-t border-border pt-6" : ""}>
            {subscription && (
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-muted">
                Changer d&apos;offre
              </h2>
            )}
            <PlanPicker
              companyId={company.id}
              plans={allPlans}
              currentPlanId={subscription?.planId}
              initialPlanId={initialPlanId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
