import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { computeMRR } from "@/lib/admin-dashboard";
import { getAllPlans } from "@/lib/plans-query";
import {
  computeMRRByPlan,
  buildExpiringWithinDays,
  mergeFinanceTransactions,
  type FinanceTransaction,
} from "@/lib/finance";
import { EventPaymentActions } from "@/components/admin/finance/event-payment-actions";
import { RenewalReminderButton } from "@/components/admin/finance/renewal-reminder-button";
import { CreditPurchaseActions } from "@/components/admin/credit-purchase-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAriary, formatDateFr, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Finances" };

const TABS = [
  { key: "paiements", label: "Paiements récents" },
  { key: "remboursements", label: "Remboursements" },
  { key: "en-attente", label: "En attente" },
];

// Phase 1 offres dynamiques (30 juillet 2026) — les 3 plans legacy sont
// nommés exactement "MEMBER"/"EXECUTIVE"/"CHAIRMAN" par prisma/backfill-plans.ts,
// donc cette table reste valable pour eux ; tout autre plan retombe sur
// "secondary" (badge.tsx reste volontairement fixe à 3 variantes de tier).
const LEGACY_PLAN_BADGE: Record<string, "chairman" | "executive" | "member"> = {
  CHAIRMAN: "chairman",
  EXECUTIVE: "executive",
  MEMBER: "member",
};
function planBadgeVariant(planName: string) {
  return LEGACY_PLAN_BADGE[planName] ?? "secondary";
}

export default async function AdminFinancesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  try {
    await requireAdmin("finances");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const activeTab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "paiements";
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activeMemberships,
    plans,
    monthMemberships,
    monthRegistrations,
    monthPurchases,
    expiring30,
    expiring60,
    expiring90,
  ] = await Promise.all([
    prisma.membership.findMany({
      where: { status: "ACTIVE" },
      select: { planId: true, price: true, startDate: true, endDate: true },
    }),
    getAllPlans(),
    prisma.membership.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { price: true },
    }),
    prisma.eventRegistration.findMany({
      where: { paymentStatus: "PAID", createdAt: { gte: startOfMonth } },
      include: { event: { select: { price: true } } },
    }),
    prisma.creditPurchase.aggregate({
      where: { status: "CONFIRMED", createdAt: { gte: startOfMonth } },
      _sum: { priceAr: true },
    }),
    prisma.membership.count({
      where: { status: "ACTIVE", endDate: buildExpiringWithinDays(30, now) },
    }),
    prisma.membership.count({
      where: { status: "ACTIVE", endDate: buildExpiringWithinDays(60, now) },
    }),
    prisma.membership.count({
      where: { status: "ACTIVE", endDate: buildExpiringWithinDays(90, now) },
    }),
  ]);

  const mrr = computeMRR(activeMemberships);
  const arr = mrr * 12;
  const mrrByPlan = computeMRRByPlan(activeMemberships);
  const countByPlan = new Map<string, number>();
  for (const m of activeMemberships) {
    const key = m.planId ?? "unknown";
    countByPlan.set(key, (countByPlan.get(key) ?? 0) + 1);
  }
  const plansByRankDesc = [...plans].sort((a, b) => b.rank - a.rank);
  const totalActiveMembers = activeMemberships.length;

  const eventRevenueThisMonth = monthRegistrations.reduce((sum, r) => sum + r.event.price, 0);
  const membershipRevenueThisMonth = monthMemberships._sum.price ?? 0;
  const creditRevenueThisMonth = monthPurchases._sum.priceAr ?? 0;

  let tabContent: React.ReactNode = null;

  if (activeTab === "paiements") {
    const [memberships, registrations, purchases] = await Promise.all([
      prisma.membership.findMany({
        where: { status: { in: ["ACTIVE", "EXPIRED", "CANCELLED"] } },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.eventRegistration.findMany({
        where: { paymentStatus: "PAID" },
        include: {
          user: { select: { name: true } },
          event: { select: { title: true, price: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.creditPurchase.findMany({
        where: { status: "CONFIRMED" },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const transactions: FinanceTransaction[] = mergeFinanceTransactions([
      ...memberships.map((m) => ({
        id: m.id,
        source: "MEMBERSHIP" as const,
        memberName: m.user.name,
        description: `Adhésion ${tierLabel(m.tier)}`,
        amount: m.price,
        method: "Evolia",
        date: m.createdAt,
      })),
      ...registrations.map((r) => ({
        id: r.id,
        source: "EVENT" as const,
        memberName: r.user.name,
        description: r.event.title,
        amount: r.event.price,
        method: r.paymentMethod ?? "",
        date: r.createdAt,
      })),
      ...purchases.map((p) => ({
        id: p.id,
        source: "CREDITS" as const,
        memberName: p.user.name,
        description: `Pack ${p.credits} crédits`,
        amount: p.priceAr,
        method: p.paymentMethod,
        date: p.createdAt,
      })),
    ]);

    tabContent =
      transactions.length === 0 ? (
        <EmptyState title="Aucun paiement" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Membre</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-left">Montant (Ar)</th>
                <th className="px-4 py-2.5 text-left">Méthode</th>
                <th className="px-4 py-2.5 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((t) => (
                <tr key={`${t.source}-${t.id}`}>
                  <td className="px-4 py-3 font-semibold text-navy">{t.memberName}</td>
                  <td className="px-4 py-3 text-text-mid">{t.description}</td>
                  <td className="px-4 py-3 font-bold">
                    {new Intl.NumberFormat("fr-FR").format(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{t.method}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDateFr(t.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  } else if (activeTab === "remboursements") {
    const refunds = await prisma.eventRegistration.findMany({
      where: { paymentStatus: "REFUNDED" },
      include: {
        user: { select: { name: true } },
        event: { select: { title: true, price: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    tabContent =
      refunds.length === 0 ? (
        <EmptyState title="Aucun remboursement en cours" />
      ) : (
        <div className="flex flex-col gap-2">
          {refunds.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-white p-4 text-sm">
              <span className="font-semibold text-navy">{r.user.name}</span> — {r.event.title} —{" "}
              {formatAriary(r.event.price)}
            </div>
          ))}
        </div>
      );
  } else if (activeTab === "en-attente") {
    const [pendingRegistrations, pendingPurchases] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { paymentStatus: "PENDING" },
        include: {
          user: { select: { name: true, email: true } },
          event: { select: { title: true, price: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.creditPurchase.findMany({
        where: { status: "PENDING" },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    tabContent =
      pendingRegistrations.length === 0 && pendingPurchases.length === 0 ? (
        <EmptyState title="Aucun paiement en attente" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Membre</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-left">Montant (Ar)</th>
                <th className="px-4 py-2.5 text-left">Depuis</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendingRegistrations.map((r) => (
                <tr key={`reg-${r.id}`}>
                  <td className="px-4 py-3 font-semibold text-navy">{r.user.name}</td>
                  <td className="px-4 py-3 text-text-mid">{r.event.title}</td>
                  <td className="px-4 py-3 font-bold">
                    {new Intl.NumberFormat("fr-FR").format(r.event.price)}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{formatDateFr(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <EventPaymentActions registrationId={r.id} memberName={r.user.name} />
                  </td>
                </tr>
              ))}
              {pendingPurchases.map((p) => (
                <tr key={`purchase-${p.id}`}>
                  <td className="px-4 py-3 font-semibold text-navy">{p.user.name}</td>
                  <td className="px-4 py-3 text-text-mid">Pack {p.credits} crédits</td>
                  <td className="px-4 py-3 font-bold">
                    {new Intl.NumberFormat("fr-FR").format(p.priceAr)}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{formatDateFr(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <CreditPurchaseActions purchaseId={p.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Finances</h1>
        <Button asChild variant="outline" size="sm">
          <a href="/api/admin/finances/export">↓ Export comptable</a>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gold bg-gold-pale p-4">
          <p className="text-2xl font-bold text-navy">{formatAriary(mrr)}</p>
          <p className="text-xs text-text-muted">
            MRR — {formatDateFr(now).split(" ").slice(1).join(" ")}
          </p>
          <p className="mt-1.5 text-xs text-text-muted">
            ARR estimé : <strong>{formatAriary(arr)}</strong>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-emerald-600">
            {formatAriary(membershipRevenueThisMonth)}
          </p>
          <p className="text-xs text-text-muted">Revenus membership ce mois</p>
          <p className="mt-1.5 text-xs text-text-muted">{totalActiveMembers} membres actifs</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-blue-600">{formatAriary(eventRevenueThisMonth)}</p>
          <p className="text-xs text-text-muted">Revenus événements ce mois</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-navy">{formatAriary(creditRevenueThisMonth)}</p>
          <p className="text-xs text-text-muted">Revenus crédits ce mois</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-navy">Revenus membership par offre (MRR)</h2>
          <div className="flex flex-col gap-3">
            {plansByRankDesc.map((plan) => {
              const planMrr = mrrByPlan.get(plan.id) ?? 0;
              return (
                <div key={plan.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={planBadgeVariant(plan.name)}>{plan.name}</Badge>
                      <span className="text-text-muted">
                        {countByPlan.get(plan.id) ?? 0} membres
                      </span>
                    </div>
                    <strong>{formatAriary(planMrr)}</strong>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-navy"
                      style={{ width: `${mrr > 0 ? Math.round((planMrr / mrr) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-navy">Abonnements expirant bientôt</h2>
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-md bg-red-50 p-2.5 text-sm">
              <span>Expirant dans 30 jours</span>
              <strong className="text-red-600">{expiring30} membres</strong>
            </div>
            <div className="flex items-center justify-between rounded-md bg-amber-50 p-2.5 text-sm">
              <span>Expirant dans 60 jours</span>
              <strong className="text-amber-700">{expiring60} membres</strong>
            </div>
            <div className="flex items-center justify-between rounded-md bg-emerald-50 p-2.5 text-sm">
              <span>Expirant dans 90 jours</span>
              <strong className="text-emerald-700">{expiring90} membres</strong>
            </div>
          </div>
          <RenewalReminderButton withinDays={30} count={expiring30} />
        </div>
      </div>

      <div className="flex gap-1 border-b-2 border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/finances?tab=${tab.key}`}
            className={`-mb-0.5 border-b-2 px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key ? "border-navy text-navy" : "border-transparent text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {tabContent}
    </div>
  );
}
