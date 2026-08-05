import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActivePlans } from "@/lib/plans-query";
import { PaymentProofForm } from "@/components/entreprise/payment-proof-form";
import { PlanPicker } from "@/components/entreprise/plan-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary } from "@/lib/utils";

export const metadata: Metadata = { title: "Paiement" };

/**
 * Phase 2 offres/paiement (30 juillet 2026), fusionné avec l'ancien
 * /entreprise/abonnement le 4 août 2026 (RG-11) — un seul écran pour choisir
 * une offre, la payer, et en changer librement tant que l'abonnement n'est
 * pas ACTIVE (y compris après soumission d'une preuve : selectPlan invalide
 * alors la preuve précédente et repasse le dossier en PENDING_PAYMENT).
 */
export default async function CompanyPaymentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (!viewer.companyId) redirect("/entreprise/creer");

  const [company, plans] = await Promise.all([
    prisma.company.findUnique({
      where: { id: viewer.companyId },
      include: {
        subscription: { include: { plan: true } },
        users: { select: { id: true } },
      },
    }),
    getActivePlans({ selfServiceOnly: true }),
  ]);
  if (!company) redirect("/entreprise/creer");
  if (company.companyAdminId !== viewer.id) redirect(`/entreprises/${company.id}`);
  if (company.subscription?.status === "ACTIVE") redirect(`/entreprises/${company.id}`);

  const subscription = company.subscription;
  const headcount = company.users.length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {subscription ? (
        <>
          <h1 className="mb-1 text-xl font-bold text-navy">Paiement — {subscription.plan.name}</h1>
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
                Votre paiement est en cours de validation par l&apos;équipe CEO Summit. Vous pouvez
                encore changer d&apos;offre ci-dessous si besoin — une nouvelle preuve sera alors
                requise.
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

      <div className={subscription ? "border-t border-border pt-6" : ""}>
        {subscription && (
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-muted">
            Changer d&apos;offre
          </h2>
        )}
        <PlanPicker companyId={company.id} plans={plans} currentPlanId={subscription?.planId} />
      </div>
    </div>
  );
}
