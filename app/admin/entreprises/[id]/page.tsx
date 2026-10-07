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
import { isPartnerOffer } from "@/lib/partner-offers";
import { PartnerSettingsForm } from "@/components/admin/partners/partner-settings-form";

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
          payments: { orderBy: { createdAt: "desc" }, include: { upsellPlan: true } },
        },
      },
    },
  });
  if (!company) notFound();

  // Audit (25 septembre 2026) — tous les paiements en attente, pas seulement
  // le plus récent : un paiement initial et un supplément (ou deux
  // soumissions successives) pouvaient coexister, l'un restant invisible —
  // donc impossible à confirmer ou refuser depuis ce back-office.
  const pendingPayments = (company.subscription?.payments ?? []).filter(
    (p) => p.status === "PENDING"
  );
  // R2 credentials absent (dev sans compte réel) ou tout autre échec de
  // résolution ne doit pas empêcher l'admin de confirmer/refuser le
  // paiement lui-même — seul le lien "voir la preuve" est indisponible.
  const pendingWithProof = await Promise.all(
    pendingPayments.map(async (payment) => {
      let proofUrl: string | null = null;
      try {
        proofUrl = await getSignedDownloadUrl(
          process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
          payment.proofFileKey
        );
      } catch (err) {
        console.error("[admin/entreprises] failed to resolve payment proof signed URL", err);
      }
      return { payment, proofUrl };
    })
  );

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
              {company.subscription.plan.pricingMode === "PER_PARTICIPANT" && " par participant"}
            </p>
            <Badge variant={company.subscription.status === "ACTIVE" ? "active" : "pending"}>
              {company.subscription.status}
            </Badge>
            {isPartnerOffer(company.subscription.plan) && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-bold text-navy">Partenariat</h3>
                <PartnerSettingsForm
                  companyId={company.id}
                  memberLimit={
                    company.subscription.memberLimit ??
                    company.subscription.plan.maxTeamMembers ??
                    2
                  }
                  counterpart={company.subscription.counterpart ?? ""}
                />
              </div>
            )}
          </>
        )}
      </div>

      {pendingWithProof.map(({ payment, proofUrl }) => (
        <div key={payment.id} className="rounded-lg border border-border bg-white p-6">
          <h2 className="mb-3 text-base font-bold text-navy">
            {payment.upsellQuantity != null
              ? "Supplément de participants à valider"
              : "Paiement à valider"}
          </h2>
          {payment.upsellQuantity != null && payment.upsellPlan && (
            <p className="mb-3 text-sm text-text-mid">
              {payment.upsellQuantity} × {payment.upsellPlan.name} — n&apos;active pas
              l&apos;abonnement (déjà actif), ajoute {payment.upsellQuantity} place(s) à la
              confirmation.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase text-text-muted">Montant déclaré</dt>
              <dd className="font-semibold text-navy">{formatAriary(payment.amount)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-muted">Mode</dt>
              <dd>{METHOD_LABEL[payment.method] ?? payment.method}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-muted">Soumis le</dt>
              <dd>{formatDateFr(payment.createdAt)}</dd>
            </div>
            {payment.comment && (
              <div className="col-span-2">
                <dt className="text-xs uppercase text-text-muted">Commentaire</dt>
                <dd>{payment.comment}</dd>
              </div>
            )}
          </dl>
          {proofUrl ? (
            <div className="mt-3">
              <PaymentProofViewer url={proofUrl} fileName={payment.proofFileKey} />
            </div>
          ) : (
            <p className="mt-3 text-xs text-text-muted">
              Aperçu de la preuve indisponible (stockage R2 non configuré dans cet environnement).
            </p>
          )}
          <div className="mt-4">
            <CompanyPaymentActions paymentId={payment.id} companyName={company.name} />
          </div>
        </div>
      ))}

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
