import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard, Landmark } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cleanPlanName, getActivePlans, getPlanBySlug } from "@/lib/plans-query";
import { getEurToArRate } from "@/lib/currency-conversion";
import { PaymentProofForm } from "@/components/entreprise/payment-proof-form";
import { PlanPicker } from "@/components/entreprise/plan-picker";
import { JourneyShell } from "@/components/onboarding/journey-shell";
import { MembershipCard } from "@/components/onboarding/membership-card";
import { EmailVerificationPanel } from "@/components/onboarding/email-verification-panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { evoliaPaymentUrl } from "@/lib/evolia";
import { EvoliaPendingPayment } from "@/components/entreprise/evolia-pending-payment";
import { planPriceEur, pluralize } from "@/lib/utils";

const PAYMENT_MODES = [
  {
    icon: CreditCard,
    label: "Carte bancaire ou Mobile Money",
    detail: "Paiement immédiat via Evolia, notre partenaire de paiement.",
  },
  {
    icon: Landmark,
    label: "Virement ou chèque",
    detail: "Joignez la preuve de paiement : notre équipe la valide.",
  },
];

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
export default async function CompanyPaymentPage(props: {
  searchParams: Promise<{ offre?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  // 14 oct. 2026 — pas de parcours d'achat pour un administrateur de la
  // plateforme : son organisation reçoit une offre Staff gratuite depuis
  // l'onglet « Gestion compte » (app/actions/staff-offer.ts).
  if (viewer.isPlatformAdmin)
    redirect(viewer.companyId ? `/entreprises/${viewer.companyId}?tab=gestion` : "/entreprise");
  if (!viewer.companyId) redirect("/entreprise/creer");

  const [company, plans, deepLinkedPlan, liveEurToArRate] = await Promise.all([
    prisma.company.findUnique({
      where: { id: viewer.companyId },
      include: {
        subscription: {
          include: {
            plan: true,
            // Paiement carte / Mobile Money lancé chez Evolia, pas encore confirmé.
            payments: {
              where: {
                status: "PENDING",
                upsellQuantity: null,
                method: { in: ["CARTE_BANCAIRE", "MOBILE_MONEY"] },
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    getActivePlans({ selfServiceOnly: true }),
    searchParams.offre ? getPlanBySlug(searchParams.offre) : null,
    getEurToArRate(),
  ]);
  if (!company) redirect("/entreprise/creer");
  if (company.companyAdminId !== viewer.id) redirect(`/entreprises/${company.id}`);
  if (company.subscription?.status === "ACTIVE") redirect(`/entreprises/${company.id}`);

  const subscription = company.subscription;
  const pendingEvoliaPayment = subscription?.payments[0] ?? null;

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

  const plan = subscription?.plan ?? null;
  const isReview = subscription?.status === "PENDING_REVIEW";
  const card = (
    <MembershipCard
      planName={plan ? cleanPlanName(plan.name) : null}
      priceEur={plan ? planPriceEur(plan, liveEurToArRate) : null}
      priceAr={
        plan
          ? plan.priceEur != null
            ? Math.round(plan.priceEur * liveEurToArRate)
            : plan.priceAr
          : null
      }
      priceSuffix={plan?.pricingMode === "PER_PARTICIPANT" ? " / participant" : undefined}
      detail={
        plan
          ? plan.pricingMode === "PER_PARTICIPANT"
            ? "Tarif par participant"
            : plan.maxTeamMembers != null
              ? `${pluralize(plan.maxTeamMembers, "participant")} inclus`
              : null
          : null
      }
      companyName={company.name}
      status={isReview ? "review" : "payment"}
    />
  );
  const signOut = (
    <SignOutButton className="flex items-center gap-1.5 text-sm font-semibold text-navy-mid hover:text-navy" />
  );

  // 14 oct. 2026 — pas de paiement tant que l'adresse e-mail n'est pas
  // confirmée (lien envoyé à l'inscription, lib/email-verification.ts) ; le
  // choix de l'offre reste possible avant. Même règle côté serveur dans
  // submitPaymentProof.
  if (subscription && !viewer.emailVerifiedAt) {
    return (
      <JourneyShell
        current="compte"
        title="Confirmez votre adresse e-mail"
        subtitle="Cliquez sur le lien reçu par e-mail pour continuer vers le paiement. C'est par cette adresse que vous recevrez les confirmations et les accès de votre équipe."
        card={card}
        headerAction={signOut}
      >
        <EmailVerificationPanel email={viewer.email} />
      </JourneyShell>
    );
  }

  if (!subscription) {
    return (
      <JourneyShell
        current="offre"
        wide
        title="Choisissez votre offre"
        subtitle={`Pour ${company.name} : l'accès de toute l'équipe s'active une fois le paiement confirmé.`}
        card={card}
        headerAction={signOut}
      >
        <PlanPicker
          companyId={company.id}
          plans={allPlans}
          initialPlanId={initialPlanId}
          liveEurToArRate={liveEurToArRate}
        />
      </JourneyShell>
    );
  }

  if (isReview) {
    return (
      <JourneyShell
        current="activation"
        title={
          pendingEvoliaPayment
            ? "Paiement en cours chez Evolia"
            : "Paiement en cours de vérification"
        }
        subtitle={
          pendingEvoliaPayment
            ? "L'accès de votre équipe s'active dès qu'Evolia nous confirme le paiement, généralement en quelques secondes."
            : "L'équipe CEO Summit vérifie votre preuve de paiement. Vous recevrez un e-mail dès que l'accès de votre équipe est activé."
        }
        card={card}
        headerAction={signOut}
      >
        {pendingEvoliaPayment ? (
          <div className="rounded-lg border border-border p-5">
            <p className="mb-4 text-sm text-text-mid">
              Paiement interrompu ? Reprenez-le là où vous l&apos;avez laissé, ou choisissez un
              autre mode de paiement.
            </p>
            <EvoliaPendingPayment
              paymentId={pendingEvoliaPayment.id}
              paymentUrl={evoliaPaymentUrl(pendingEvoliaPayment.id)}
              startedAt={pendingEvoliaPayment.createdAt.toISOString()}
            />
          </div>
        ) : (
          <p className="text-sm text-text-mid">
            Une question sur votre paiement ? Écrivez à{" "}
            <a href="mailto:register@ceo-summit.mg" className="font-semibold text-navy">
              register@ceo-summit.mg
            </a>
            .
          </p>
        )}
      </JourneyShell>
    );
  }

  return (
    <JourneyShell
      current="paiement"
      title="Procédez au paiement"
      subtitle={
        // 14 oct. 2026 — deux modes de paiement, deux lignes distinctes
        // (une seule phrase les mélangeait).
        <ul className="mt-1 flex flex-col gap-2.5">
          {PAYMENT_MODES.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-pale text-navy">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <strong className="font-semibold text-navy">{label}</strong>
                <span className="block text-sm text-text-mid">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
      }
      card={card}
      headerAction={signOut}
    >
      <PaymentProofForm
        companyId={company.id}
        companySubscriptionId={subscription.id}
        planId={subscription.planId}
        priceAr={subscription.plan.priceAr}
        priceEur={subscription.plan.priceEur}
        minParticipants={subscription.plan.minParticipants}
        pricingMode={subscription.plan.pricingMode}
        maxTeamMembers={subscription.plan.maxTeamMembers}
        groupPlans={allPlans.filter((p) => p.pricingMode === "PER_PARTICIPANT")}
        liveEurToArRate={liveEurToArRate}
      />

      <details className="group mt-10 border-t border-border pt-6">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-navy-mid hover:text-navy">
          Changer d&apos;offre
          <span className="text-xs font-normal text-text-muted group-open:hidden">
            Offre actuelle : {cleanPlanName(subscription.plan.name)}
          </span>
        </summary>
        <div className="mt-4">
          <PlanPicker
            compact
            companyId={company.id}
            plans={allPlans}
            currentPlanId={subscription.planId}
            initialPlanId={initialPlanId}
            liveEurToArRate={liveEurToArRate}
          />
        </div>
      </details>
    </JourneyShell>
  );
}
