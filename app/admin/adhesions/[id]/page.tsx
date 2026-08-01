import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getSignedDownloadUrl } from "@/lib/r2";
import { Badge } from "@/components/ui/badge";
import { MembershipPaymentActions } from "@/components/admin/adhesions/membership-payment-actions";
import { formatAriary, formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Adhésion" };

const METHOD_LABEL: Record<string, string> = {
  VIREMENT: "Virement bancaire",
  CHEQUE: "Chèque",
  CARTE_BANCAIRE: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
};

/** Phase 2ter (1er août 2026) — détail adhésion + revue paiement, miroir de /admin/entreprises/[id]. */
export default async function AdminMembershipDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("adhesions");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const membership = await prisma.membership.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      plan: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!membership) notFound();

  const latestPendingPayment = membership.payments.find((p) => p.status === "PENDING");
  let proofUrl: string | null = null;
  if (latestPendingPayment) {
    try {
      proofUrl = await getSignedDownloadUrl(
        process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
        latestPendingPayment.proofFileKey
      );
    } catch (err) {
      console.error("[admin/adhesions] failed to resolve payment proof signed URL", err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/adhesions" className="text-sm text-text-muted">
        ← Adhésions
      </Link>

      <div className="rounded-lg border border-border bg-white p-6">
        <h1 className="text-xl font-bold text-navy">{membership.user.name}</h1>
        <p className="text-sm text-text-muted">{membership.user.email}</p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6">
        <h2 className="mb-3 text-base font-bold text-navy">Adhésion</h2>
        {!membership.plan ? (
          <p className="text-sm text-text-muted">Offre introuvable.</p>
        ) : (
          <>
            <p className="text-sm text-text-mid">
              {membership.plan.name} — {formatAriary(membership.plan.priceAr)}/an
            </p>
            <Badge variant={membership.status === "ACTIVE" ? "active" : "pending"}>
              {membership.status}
            </Badge>
          </>
        )}
      </div>

      {latestPendingPayment && (
        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="mb-3 text-base font-bold text-navy">Paiement à valider</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase text-text-muted">Montant déclaré</dt>
              <dd className="font-semibold text-navy">
                {formatAriary(latestPendingPayment.amount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-muted">Mode</dt>
              <dd>{METHOD_LABEL[latestPendingPayment.method] ?? latestPendingPayment.method}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-muted">Soumis le</dt>
              <dd>{formatDateFr(latestPendingPayment.createdAt)}</dd>
            </div>
            {latestPendingPayment.comment && (
              <div className="col-span-2">
                <dt className="text-xs uppercase text-text-muted">Commentaire</dt>
                <dd>{latestPendingPayment.comment}</dd>
              </div>
            )}
          </dl>
          {proofUrl ? (
            <a
              href={proofUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm font-medium text-navy-mid"
            >
              Voir la preuve de paiement →
            </a>
          ) : (
            <p className="mt-3 text-xs text-text-muted">
              Aperçu de la preuve indisponible (stockage R2 non configuré dans cet environnement).
            </p>
          )}
          <div className="mt-4">
            <MembershipPaymentActions
              paymentId={latestPendingPayment.id}
              memberName={membership.user.name}
            />
          </div>
        </div>
      )}
    </div>
  );
}
