import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MembershipPaymentForm } from "@/components/entreprise/membership-payment-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary } from "@/lib/utils";

export const metadata: Metadata = { title: "Paiement" };

/** Phase 2ter (1er août 2026) — soumission de la preuve de paiement, miroir de /entreprise/paiement. */
export default async function MembershipPaymentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      status: { in: ["PENDING_PAYMENT", "PENDING_REVIEW"] },
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (!membership || !membership.plan) redirect("/paiement-en-attente");

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-1 text-xl font-bold text-navy">Paiement — {membership.plan.name}</h1>
      <p className="mb-4 text-sm text-text-muted">
        {formatAriary(membership.plan.priceAr)} / an. Choisissez votre mode de paiement, uploadez
        une preuve (bordereau, reçu, capture) — l&apos;équipe CEO Summit valide manuellement chaque
        paiement.
      </p>

      {membership.status === "PENDING_REVIEW" ? (
        <Alert>
          <AlertDescription>
            Votre paiement est en cours de validation par l&apos;équipe CEO Summit.
          </AlertDescription>
        </Alert>
      ) : (
        <MembershipPaymentForm membershipId={membership.id} amount={membership.plan.priceAr} />
      )}
    </div>
  );
}
