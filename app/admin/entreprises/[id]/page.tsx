import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getSignedDownloadUrl } from "@/lib/r2";
import { Badge } from "@/components/ui/badge";
import { CompanyPaymentActions } from "@/components/admin/entreprises/company-payment-actions";
import { PaymentProofViewer } from "@/components/admin/entreprises/payment-proof-viewer";
import { ReassignAdminForm } from "@/components/admin/entreprises/reassign-admin-form";
import { formatAriary, formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Entreprise" };

const METHOD_LABEL: Record<string, string> = {
  VIREMENT: "Virement bancaire",
  CHEQUE: "Chèque",
  CARTE_BANCAIRE: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
};

/** Phase 2 offres/paiement (30 juillet 2026) — détail entreprise + revue paiement. */
export default async function AdminCompanyDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("entreprises");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      companyAdmin: { select: { id: true, name: true, email: true } },
      users: { select: { id: true, name: true, email: true, status: true } },
      subscription: {
        include: {
          plan: true,
          payments: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!company) notFound();

  const latestPendingPayment = company.subscription?.payments.find((p) => p.status === "PENDING");
  // R2 credentials absent (dev sans compte réel) ou tout autre échec de
  // résolution ne doit pas empêcher l'admin de confirmer/refuser le
  // paiement lui-même — seul le lien "voir la preuve" est indisponible.
  let proofUrl: string | null = null;
  if (latestPendingPayment) {
    try {
      proofUrl = await getSignedDownloadUrl(
        process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
        latestPendingPayment.proofFileKey
      );
    } catch (err) {
      console.error("[admin/entreprises] failed to resolve payment proof signed URL", err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/entreprises" className="text-sm text-text-muted">
        ← Entreprises
      </Link>

      <div className="rounded-lg border border-border bg-white p-6">
        <h1 className="text-xl font-bold text-navy">{company.name}</h1>
        <p className="text-sm text-text-muted">
          {company.sector} · {company.country}
        </p>
        <p className="mt-2 text-sm text-text-mid">
          Admin entreprise : {company.companyAdmin?.name ?? "—"}{" "}
          {company.companyAdmin && `(${company.companyAdmin.email})`}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6">
        <h2 className="mb-3 text-base font-bold text-navy">Réassigner l&apos;admin entreprise</h2>
        <ReassignAdminForm
          companyId={company.id}
          members={company.users}
          currentAdminId={company.companyAdmin?.id ?? null}
        />
      </div>

      <div className="rounded-lg border border-border bg-white p-6">
        <h2 className="mb-3 text-base font-bold text-navy">Abonnement</h2>
        {!company.subscription ? (
          <p className="text-sm text-text-muted">Aucune offre choisie.</p>
        ) : (
          <>
            <p className="text-sm text-text-mid">
              {company.subscription.plan.name} — {formatAriary(company.subscription.plan.priceAr)}
              /an
            </p>
            <Badge variant={company.subscription.status === "ACTIVE" ? "active" : "pending"}>
              {company.subscription.status}
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
            <div className="mt-3">
              <PaymentProofViewer url={proofUrl} fileName={latestPendingPayment.proofFileKey} />
            </div>
          ) : (
            <p className="mt-3 text-xs text-text-muted">
              Aperçu de la preuve indisponible (stockage R2 non configuré dans cet environnement).
            </p>
          )}
          <div className="mt-4">
            <CompanyPaymentActions paymentId={latestPendingPayment.id} companyName={company.name} />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-white p-6">
        <h2 className="mb-3 text-base font-bold text-navy">Membres ({company.users.length})</h2>
        <div className="flex flex-col gap-2">
          {company.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between text-sm">
              <span>
                {u.name} <span className="text-text-muted">({u.email})</span>
              </span>
              <Badge variant={u.status === "ACTIVE" ? "active" : "pending"}>{u.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
