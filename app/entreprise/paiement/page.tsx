import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PaymentProofForm } from "@/components/entreprise/payment-proof-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary } from "@/lib/utils";

export const metadata: Metadata = { title: "Paiement" };

/** Phase 2 offres/paiement (30 juillet 2026) — soumission de la preuve de paiement. */
export default async function CompanyPaymentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (!viewer.companyId) redirect("/entreprise/creer");

  const company = await prisma.company.findUnique({
    where: { id: viewer.companyId },
    include: { subscription: { include: { plan: true } }, users: { select: { id: true } } },
  });
  if (!company) redirect("/entreprise/creer");
  if (company.companyAdminId !== viewer.id) redirect(`/entreprises/${company.id}`);
  if (!company.subscription) redirect("/entreprise/abonnement");
  if (company.subscription.status === "ACTIVE") redirect(`/entreprises/${company.id}`);

  const headcount = company.users.length;

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-1 text-xl font-bold text-navy">
        Paiement — {company.subscription.plan.name}
      </h1>
      <p className="mb-4 text-sm text-text-muted">
        {formatAriary(company.subscription.plan.priceAr)} / participant / an. Choisissez votre mode
        de paiement, uploadez une preuve (bordereau, reçu, capture) — l&apos;équipe CEO Summit
        valide manuellement chaque paiement.
      </p>

      {company.subscription.status === "PENDING_REVIEW" ? (
        <Alert>
          <AlertDescription>
            Votre paiement est en cours de validation par l&apos;équipe CEO Summit.
          </AlertDescription>
        </Alert>
      ) : (
        <PaymentProofForm
          companySubscriptionId={company.subscription.id}
          pricePerParticipant={company.subscription.plan.priceAr}
          minParticipants={company.subscription.plan.minParticipants}
          headcount={headcount}
        />
      )}
    </div>
  );
}
