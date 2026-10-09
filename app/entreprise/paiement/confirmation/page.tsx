import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isEvoliaPaymentMethod } from "@/lib/payment-methods";
import { OnboardingHeader } from "@/components/onboarding/onboarding-header";
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
export default async function PaymentConfirmationPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: { include: { subscription: true } } },
  });
  if (!viewer?.company?.subscription) redirect("/entreprise/paiement");
  const { company } = viewer;
  const subscription = company.subscription!;

  // Paiement visé : celui de la référence s'il appartient bien à cette
  // entreprise, sinon le dernier paiement par carte / Mobile Money.
  const payments = await prisma.companyPayment.findMany({
    where: { companySubscriptionId: subscription.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, status: true, method: true },
  });
  const payment =
    payments.find((p) => p.id === searchParams.ref) ??
    payments.find((p) => isEvoliaPaymentMethod(p.method)) ??
    null;

  const destination = `/entreprises/${company.id}?tab=gestion`;
  const confirmed =
    payment?.status === "CONFIRMED" || (!payment && subscription.status === "ACTIVE");
  const cancelled = payment?.status === "REJECTED";

  return (
    <div className="flex flex-col items-center">
      <OnboardingHeader backHref="/entreprise/paiement" />
      <div className="mx-auto max-w-lg p-6 text-center">
        <h1 className="mb-3 text-xl font-bold text-navy">
          {cancelled ? "Paiement non abouti" : "Merci pour votre paiement"}
        </h1>

        {cancelled ? (
          <>
            <p className="mb-6 text-sm text-text-mid">
              Ce paiement a été annulé de notre côté. Si vous avez été débité, contactez
              l&apos;équipe CEO Summit : nous régulariserons votre situation.
            </p>
            <Button asChild>
              <Link href="/entreprise/paiement">Retour au paiement</Link>
            </Button>
          </>
        ) : (
          <PaymentConfirmationWatcher confirmed={confirmed} destination={destination} />
        )}
      </div>
    </div>
  );
}
