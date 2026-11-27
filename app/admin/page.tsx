import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  buildActivityFeed,
  buildMonthlyRevenueSeries,
  sumCollected,
  sumSeatsSold,
} from "@/lib/admin-dashboard";
import {
  COMPANY_PAYMENT_FINANCE_INCLUDE,
  companyPaymentToTransaction,
  eventRegistrationToTransaction,
  toEuroAmount,
} from "@/lib/finance";
import { getEurToArRate } from "@/lib/currency-conversion";
import { seatCap } from "@/lib/company-seats";
import { TO_REVIEW_FILTER, TO_REVIEW_WHERE } from "@/lib/admin-subscriptions-query";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAriary, formatDateFr, formatEuro } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Tableau de bord" };

/**
 * E8-T02 — dashboard admin. Every number here is computed from real rows
 * (seed data today, live data once E1/E3 traffic accumulates) — no
 * fabricated deltas ("+12 this month" style trends from the wireframe):
 * there's no historical snapshot to compute those from honestly yet, so
 * they're simply not shown rather than invented.
 */
export default async function AdminDashboardPage() {
  const [
    activeUsersCount,
    activeSubscriptions,
    allCompanyPaymentsForRevenue,
    paidEventRegistrations,
    subscriptionsByStatus,
    toReviewCount,
    pendingCompanyPayments,
    eurToArRate,
    pendingEventPayments,
    pendingReports,
    upcomingEvents,
    recentCompanyPayments,
    recentRegistrations,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    // Abonnements actifs : places vendues par événement.
    prisma.companySubscription.findMany({
      where: { status: "ACTIVE" },
      select: {
        declaredParticipants: true,
        extraSeats: true,
        memberLimit: true,
        unlimitedSeats: true,
        plan: { select: { eventId: true, pricingMode: true, maxTeamMembers: true } },
      },
    }),
    // 27 nov. 2026 — mêmes paiements que la page Finances (encaissé total, en € et Ar).
    prisma.companyPayment.findMany({
      where: { status: "CONFIRMED" },
      include: COMPANY_PAYMENT_FINANCE_INCLUDE,
    }),
    prisma.eventRegistration.findMany({
      where: { paymentStatus: "PAID" },
      select: {
        id: true,
        eurToArRate: true,
        paymentMethod: true,
        createdAt: true,
        user: { select: { name: true } },
        event: { select: { title: true, price: true } },
      },
    }),
    prisma.companySubscription.groupBy({ by: ["status"], _count: true }),
    prisma.companySubscription.count({ where: TO_REVIEW_WHERE }),
    prisma.companyPayment.aggregate({
      where: { status: "PENDING" },
      _count: true,
      _sum: { amount: true },
    }),
    getEurToArRate(),
    prisma.eventRegistration.count({ where: { paymentStatus: "PENDING" } }),
    prisma.roomReport.count({ where: { status: "PENDING" } }),
    prisma.event.findMany({
      where: { status: "PUBLISHED", date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 3,
      include: {
        _count: {
          select: {
            registrations: { where: { status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } },
          },
        },
      },
    }),
    prisma.companyPayment.findMany({
      where: { status: "CONFIRMED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        companySubscription: {
          include: { company: { select: { name: true } }, plan: { select: { name: true } } },
        },
      },
    }),
    prisma.eventRegistration.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { name: true } }, event: { select: { title: true } } },
    }),
  ]);

  // Encaissé : la date de validation du paiement (celle du graphique), à défaut sa création.
  const collectedEntries = [
    ...allCompanyPaymentsForRevenue.map((p) => ({
      amount: p.amount,
      amountEur: toEuroAmount(companyPaymentToTransaction(p), eurToArRate).amountEur,
      date: p.reviewedAt ?? p.createdAt,
    })),
    // Les événements gratuits (inscription comprise dans l'offre) ne comptent pas.
    ...paidEventRegistrations
      .filter((r) => r.event.price > 0)
      .map((r) => ({
        amount: r.event.price,
        amountEur: toEuroAmount(eventRegistrationToTransaction(r), eurToArRate).amountEur,
        date: r.createdAt,
      })),
  ];
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const collected = sumCollected(collectedEntries, startOfMonth);
  const revenueEntries = collectedEntries.map((e) => ({ amount: e.amount, date: e.date }));

  const statusCount = (status: string) =>
    subscriptionsByStatus.find((g) => g.status === status)?._count ?? 0;
  const awaitingPaymentCount = statusCount("PENDING_PAYMENT");
  const activeCompaniesCount = statusCount("ACTIVE");

  const revenueSeries = buildMonthlyRevenueSeries(revenueEntries, 12);

  const nextEvent = upcomingEvents[0];
  const seatsSold = nextEvent
    ? sumSeatsSold(
        activeSubscriptions.filter((s) => s.plan.eventId === nextEvent.id).map((s) => seatCap(s))
      )
    : null;

  const activity = buildActivityFeed(
    [
      ...recentCompanyPayments.map((p) => ({
        type: "company_payment",
        message: `Paiement confirmé — ${p.companySubscription.company.name} (${p.companySubscription.plan.name}, ${formatAriary(p.amount)})`,
        date: p.createdAt,
      })),
      ...recentRegistrations.map((r) => ({
        type: "registration",
        message: `Inscription événement — ${r.user.name} à ${r.event.title}`,
        date: r.createdAt,
      })),
    ],
    8
  );

  const alerts = [
    pendingEventPayments > 0 && {
      label: `${pendingEventPayments} paiement${pendingEventPayments > 1 ? "s" : ""} événement en attente`,
      href: "/admin/evenements",
    },
    pendingReports > 0 && {
      label: `${pendingReports} signalement${pendingReports > 1 ? "s" : ""}`,
      href: "/admin/salles",
    },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <div className="flex flex-col gap-5">
      {alerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>🔴</span>
          {alerts.map((alert, i) => (
            <span key={alert.href}>
              <strong>{alert.label}</strong>
              {" — "}
              <Link href={alert.href} className="font-semibold underline">
                Traiter →
              </Link>
              {i < alerts.length - 1 && <span className="mx-2 text-red-300">·</span>}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          href="/admin/finances"
          value={formatAriary(collected.totalAr)}
          label="Encaissé"
          details={[
            `≈ ${formatEuro(collected.totalEur)} · ${collected.count} paiement(s)`,
            `Ce mois-ci : ${formatAriary(collected.sinceAr)}`,
          ]}
        />
        <KpiCard
          href="/admin/entreprises?statut=PENDING_PAYMENT"
          value={String(awaitingPaymentCount)}
          label="Entreprises en attente de paiement"
          details={[
            pendingCompanyPayments._count > 0
              ? `${pendingCompanyPayments._count} paiement(s) en cours · ${formatAriary(pendingCompanyPayments._sum.amount ?? 0)}`
              : "Aucun paiement en cours",
          ]}
        />
        <KpiCard
          href={`/admin/entreprises?statut=${TO_REVIEW_FILTER}`}
          value={String(activeCompaniesCount)}
          label="Entreprises actives"
          details={[`${toReviewCount} à valider`, `${activeUsersCount} membres actifs`]}
        />
        {nextEvent && seatsSold ? (
          <KpiCard
            href="/admin/evenements"
            value={`${nextEvent._count.registrations} / ${seatsSold.seats}`}
            label="Participants nommés / places vendues"
            details={[
              nextEvent.title,
              `Capacité ${nextEvent.capacity}${seatsSold.unlimited > 0 ? ` · ${seatsSold.unlimited} offre(s) sans plafond` : ""}`,
            ]}
          />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-text-muted">Aucun événement à venir</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenus — 12 derniers mois</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activité récente</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune activité pour l&apos;instant.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {activity.map((item, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <div>
                      <p className="text-text">{item.message}</p>
                      <p className="text-xs text-text-muted">{formatDateFr(item.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Prochains événements</CardTitle>
          <Link href="/admin/evenements" className="text-xs font-semibold text-navy-mid">
            Gérer les événements →
          </Link>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun événement à venir.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-navy">{event.title}</p>
                    <p className="text-xs text-text-muted">
                      {formatDateFr(event.date, event.timezone)} · {event.location}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-text-muted">
                    {event._count.registrations}/{event.capacity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  href,
  value,
  label,
  details,
}: {
  href: string;
  value: string;
  label: string;
  details: string[];
}) {
  return (
    <Link href={href} className="group rounded-lg focus-visible:outline-none focus-visible:ring-2">
      <Card className="h-full transition-colors group-hover:border-navy-mid">
        <CardContent className="pt-6">
          <p className="text-2xl font-bold text-navy">{value}</p>
          <p className="text-sm text-text-muted">{label}</p>
          <div className="mt-2 flex flex-col gap-0.5 text-xs text-text-muted">
            {details.map((d) => (
              <p key={d} className="truncate">
                {d}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
