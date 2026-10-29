import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAriary, formatDateFr } from "@/lib/utils";
import { PARTNER_OFFER_WHERE, isPartnerOffer } from "@/lib/partner-offers";
import { InvitePartnerForm } from "@/components/admin/partners/invite-partner-form";
import { PartnerInviteActions } from "@/components/admin/partners/partner-invite-actions";
import { PaymentReminderButton } from "@/components/admin/entreprises/payment-reminder-button";
import { COMPANY_PAYMENT_REMINDER_ACTION } from "@/lib/company-payment-reminder";

export const metadata: Metadata = { title: "Admin — Entreprises" };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Aucune offre",
  PENDING_PAYMENT: "En attente de paiement",
  PENDING_REVIEW: "À valider",
  ACTIVE: "Active",
  EXPIRED: "Expirée",
  SUSPENDED: "Suspendue",
  CANCELLED: "Annulée",
};
const STATUS_BADGE: Record<string, "active" | "pending" | "refused" | "draft"> = {
  DRAFT: "draft",
  PENDING_PAYMENT: "pending",
  PENDING_REVIEW: "pending",
  ACTIVE: "active",
  EXPIRED: "refused",
  SUSPENDED: "refused",
  CANCELLED: "refused",
};

/** Module 20 — statut affiché d'une invitation partenaire. */
function partnerInviteStatus(invite: { status: string; expiresAt: Date }, now: Date) {
  if (invite.status === "ACCEPTED") return { label: "Compte créé", badge: "active" as const };
  if (invite.status === "REVOKED") return { label: "Annulée", badge: "draft" as const };
  if (invite.expiresAt < now) return { label: "Expirée", badge: "refused" as const };
  return { label: "En attente", badge: "pending" as const };
}

/** Phase 2 offres/paiement (30 juillet 2026) — file d'entreprises à valider. */
export default async function AdminEntreprisesPage() {
  try {
    await requireAdmin("entreprises");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const subscriptions = await prisma.companySubscription.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      company: {
        select: { id: true, name: true, companyAdmin: { select: { name: true, email: true } } },
      },
      plan: {
        select: {
          name: true,
          priceAr: true,
          pricingMode: true,
          isActive: true,
          isSelfService: true,
          isUpsell: true,
        },
      },
      payments: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  /**
   * 22 septembre 2026 (`conception/12` §3.2) — un supplément de participants
   * en attente n'est pas reflété par `status` (l'abonnement reste ACTIVE,
   * voir lib/payment-confirmations.ts) : compter aussi les abonnements avec
   * un paiement PENDING, quel que soit leur statut.
   */
  const awaitingPaymentIds = subscriptions
    .filter((s) => s.status === "PENDING_PAYMENT")
    .map((s) => s.companyId);
  const [partnerOffers, partnerInvites, reminders] = await Promise.all([
    prisma.plan.findMany({
      where: PARTNER_OFFER_WHERE,
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, maxTeamMembers: true },
    }),
    prisma.partnerInvite.findMany({
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { name: true } } },
    }),
    // 29 oct. 2026 — date de la dernière relance de paiement, par entreprise.
    prisma.auditLog.groupBy({
      by: ["targetId"],
      where: {
        action: COMPANY_PAYMENT_REMINDER_ACTION,
        targetType: "Company",
        targetId: { in: awaitingPaymentIds },
      },
      _max: { createdAt: true },
    }),
  ]);
  const lastReminderByCompany = new Map(reminders.map((r) => [r.targetId, r._max.createdAt]));
  const now = new Date();

  const pendingReviewCount = subscriptions.filter(
    (s) => s.status === "PENDING_REVIEW" || s.payments.length > 0
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy">Entreprises</h1>
        <p className="text-sm text-text-muted">
          {subscriptions.length} abonnement(s) · {pendingReviewCount} à valider
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-navy">Partenaires</h2>
          <p className="text-sm text-text-muted">
            Offres sans paiement attribuées par l&apos;équipe : le gérant invité crée son compte et
            son entreprise depuis l&apos;e-mail reçu.
          </p>
        </div>
        <InvitePartnerForm
          offers={partnerOffers.map((o) => ({
            id: o.id,
            name: o.name,
            defaultMembers: o.maxTeamMembers ?? 2,
          }))}
        />
        {partnerInvites.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Gérant</th>
                  <th className="px-4 py-2.5 text-left">Offre</th>
                  <th className="px-4 py-2.5 text-left">Membres</th>
                  <th className="px-4 py-2.5 text-left">Statut</th>
                  <th className="px-4 py-2.5 text-left">Invité le</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {partnerInvites.map((invite) => {
                  const status = partnerInviteStatus(invite, now);
                  return (
                    <tr key={invite.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">{invite.name}</p>
                        <p className="text-xs text-text-muted">{invite.email}</p>
                      </td>
                      <td className="px-4 py-3 text-text-mid">{invite.plan.name}</td>
                      <td className="px-4 py-3 text-text-mid">{invite.memberLimit ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={status.badge}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-text-mid">{formatDateFr(invite.createdAt)}</td>
                      <td className="px-4 py-3">
                        {invite.status === "PENDING" ? (
                          <PartnerInviteActions inviteId={invite.id} email={invite.email} />
                        ) : invite.companyId ? (
                          <div className="flex justify-end">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/admin/entreprises/${invite.companyId}`}>
                                Voir l&apos;entreprise
                              </Link>
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 className="text-base font-bold text-navy">Abonnements</h2>

      {subscriptions.length === 0 ? (
        <EmptyState title="Aucune entreprise n'a encore choisi d'offre" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Entreprise</th>
                <th className="px-4 py-2.5 text-left">Admin</th>
                <th className="px-4 py-2.5 text-left">Offre</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5 text-left">Mise à jour</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3 font-semibold text-navy">{sub.company.name}</td>
                  <td className="px-4 py-3 text-text-mid">
                    {sub.company.companyAdmin?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-mid">
                    {isPartnerOffer(sub.plan) ? (
                      <>
                        {sub.plan.name} <Badge variant="secondary">Partenaire</Badge>
                      </>
                    ) : (
                      <>
                        {sub.plan.name} · {formatAriary(sub.plan.priceAr)}
                        {sub.plan.pricingMode === "PER_PARTICIPANT" && " / participant"}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[sub.status]}>{STATUS_LABEL[sub.status]}</Badge>
                    {sub.status !== "PENDING_REVIEW" && sub.payments.length > 0 && (
                      <Badge variant="pending" className="ml-1.5">
                        Supplément à valider
                      </Badge>
                    )}
                    {sub.status === "PENDING_PAYMENT" &&
                      lastReminderByCompany.get(sub.companyId) && (
                        <p className="mt-1 text-xs text-text-muted">
                          Relancé le {formatDateFr(lastReminderByCompany.get(sub.companyId)!)}
                        </p>
                      )}
                  </td>
                  <td className="px-4 py-3 text-text-mid">{formatDateFr(sub.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {sub.status === "PENDING_PAYMENT" && sub.company.companyAdmin && (
                        <PaymentReminderButton
                          compact
                          companyId={sub.company.id}
                          companyName={sub.company.name}
                          adminName={sub.company.companyAdmin.name}
                          adminEmail={sub.company.companyAdmin.email}
                        />
                      )}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/entreprises/${sub.company.id}`}>Voir</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
