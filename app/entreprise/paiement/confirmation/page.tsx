import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isEvoliaPaymentMethod, REVIVABLE_EVOLIA_REASONS } from "@/lib/payment-methods";
import { evoliaPaymentUrl } from "@/lib/evolia";
import { EvoliaPendingPayment } from "@/components/entreprise/evolia-pending-payment";
import { JourneyShell } from "@/components/onboarding/journey-shell";
import { MembershipCard } from "@/components/onboarding/membership-card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { cleanPlanName } from "@/lib/plans-query";
import { PaymentConfirmationWatcher } from "@/components/entreprise/payment-confirmation-watcher";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Confirmation du paiement" };

/**
 * Page de retour après paiement chez Evolia (8 oct. 2026). Evolia y renvoie
 * le gérant une fois le paiement finalisé, avec `?ref=<ceoSummitReference>`.
 * La confirmation d'Evolia (webhook) arrive en parallèle : on patiente
 * jusqu'à ce qu'elle soit enregistrée, puis on ouvre l'espace du gérant sur
 * la désignation des participants à l'événement.
 */
export default async function PaymentConfirmationPage(props: {
  searchParams: Promise<{ ref?: string; status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: { include: { subscription: { include: { plan: true } } } } },
  });
  // 14 oct. 2026 — pas de parcours d'achat pour un administrateur de la plateforme.
  if (viewer?.isPlatformAdmin) {
    redirect(viewer.companyId ? `/entreprises/${viewer.companyId}?tab=gestion` : "/entreprise");
  }
  if (!viewer?.company?.subscription) redirect("/entreprise/paiement");
  const { company } = viewer;
  const subscription = company.subscription!;

  // Paiement visé : celui de la référence s'il appartient bien à cette
  // entreprise, sinon le dernier paiement par carte / Mobile Money.
  const payments = await prisma.companyPayment.findMany({
    where: { companySubscriptionId: subscription.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      method: true,
      createdAt: true,
      rejectionReason: true,
      upsellQuantity: true,
    },
  });
  const payment =
    payments.find((p) => p.id === searchParams.ref) ??
    payments.find((p) => isEvoliaPaymentMethod(p.method)) ??
    null;

  const destination = `/entreprises/${company.id}?tab=gestion`;
  const confirmed =
    payment?.status === "CONFIRMED" || (!payment && subscription.status === "ACTIVE");
  const cancelled = payment?.status === "REJECTED";
  const failedAtEvolia = searchParams.status === "failed" || searchParams.status === "cancelled";
  // Relance possible : paiement Evolia encore en attente, ou annulé (par le
  // gérant, par Evolia, ou faute de transmission) et toujours le plus récent
  // de son type — sinon un autre paiement l'a déjà remplacé.
  const latestOfKind =
    payment &&
    payments.find((p) => (p.upsellQuantity == null) === (payment.upsellQuantity == null))?.id ===
      payment.id;
  const retryable =
    payment != null &&
    isEvoliaPaymentMethod(payment.method) &&
    latestOfKind &&
    (payment.status === "PENDING" ||
      (payment.status === "REJECTED" &&
        REVIVABLE_EVOLIA_REASONS.includes(payment.rejectionReason ?? "")));
  const retryActions =
    retryable && payment ? (
      <EvoliaPendingPayment
        paymentId={payment.id}
        paymentUrl={payment.status === "PENDING" ? await evoliaPaymentUrl(payment.id) : null}
        startedAt={payment.createdAt.toISOString()}
      />
    ) : null;
  const notCompleted = cancelled || (failedAtEvolia && !confirmed);

  return (
    <JourneyShell
      current="activation"
      title={notCompleted ? "Paiement non abouti" : "Merci pour votre paiement"}
      card={
        <MembershipCard
          planName={cleanPlanName(subscription.plan.name)}
          companyName={company.name}
          status={confirmed ? "active" : notCompleted ? "payment" : "review"}
        />
      }
      headerAction={
        <SignOutButton className="flex items-center gap-1.5 text-sm font-semibold text-navy-mid hover:text-navy" />
      }
    >
      {notCompleted ? (
        <>
          <p className="mb-6 text-sm text-text-mid">
            {cancelled
              ? "Ce paiement n'a pas abouti et a été annulé."
              : "Votre paiement n'a pas abouti."}{" "}
            Vous pouvez recommencer, avec une autre carte ou un autre numéro Mobile Money, ou payer
            autrement. Si vous avez été débité, ne recommencez pas : contactez l&apos;équipe CEO
            Summit à{" "}
            <a href="mailto:register@ceo-summit.mg" className="font-semibold text-navy">
              register@ceo-summit.mg
            </a>
            , nous régulariserons votre situation.
          </p>
          {retryActions ?? (
            <Button asChild>
              <Link href="/entreprise/paiement">Retour au paiement</Link>
            </Button>
          )}
        </>
      ) : (
        <PaymentConfirmationWatcher
          confirmed={confirmed}
          destination={destination}
          pendingActions={retryActions}
        />
      )}
    </JourneyShell>
  );
}
