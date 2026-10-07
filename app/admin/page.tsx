import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { buildActivityFeed, buildMonthlyRevenueSeries, computeMRR } from "@/lib/admin-dashboard";
import { buildBroadcastRecipientsWhere } from "@/lib/broadcast-segments";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAriary, formatDateFr } from "@/lib/utils";

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
    chairmanCount,
    executiveCount,
    activeSubscriptions,
    allCompanyPaymentsForRevenue,
    paidEventRegistrations,
    pendingEventPayments,
    pendingReports,
    upcomingEvents,
    recentCompanyPayments,
    recentRegistrations,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({
      where: { status: "ACTIVE", ...buildBroadcastRecipientsWhere("CHAIRMAN") },
    }),
    prisma.user.count({
      where: { status: "ACTIVE", ...buildBroadcastRecipientsWhere("EXECUTIVE") },
    }),
    prisma.companySubscription.findMany({
      where: { status: { in: ["ACTIVE", "EXPIRED"] } },
      select: {
        startDate: true,
        endDate: true,
        payments: {
          where: { status: "CONFIRMED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { amount: true },
        },
      },
    }),
    prisma.companyPayment.findMany({
      where: { status: "CONFIRMED", reviewedAt: { not: null } },
      select: { amount: true, reviewedAt: true },
    }),
    prisma.eventRegistration.findMany({
      where: { paymentStatus: "PAID" },
      select: { createdAt: true, event: { select: { price: true } } },
    }),
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

  const roleCounts = { CHAIRMAN: chairmanCount, EXECUTIVE: executiveCount };

  // Un abonnement ACTIVE/EXPIRED a toujours des dates réelles — filtre
  // défensif, voir admin/finances/page.tsx.
  const mrr = computeMRR(
    activeSubscriptions
      .filter(
        (s): s is typeof s & { startDate: Date; endDate: Date } =>
          s.startDate != null && s.endDate != null
      )
      .map((s) => ({
        price: s.payments[0]?.amount ?? 0,
        startDate: s.startDate,
        endDate: s.endDate,
      }))
  );

  const revenueEntries = [
    ...allCompanyPaymentsForRevenue.map((p) => ({ amount: p.amount, date: p.reviewedAt! })),
    ...paidEventRegistrations.map((r) => ({ amount: r.event.price, date: r.createdAt })),
  ];
  const revenueSeries = buildMonthlyRevenueSeries(revenueEntries, 12);

  const nextEvent = upcomingEvents[0];

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-navy">{activeUsersCount}</p>
            <p className="text-sm text-text-muted">Membres actifs</p>
            <p className="mt-2 text-xs text-text-muted">
              {roleCounts.CHAIRMAN} Chairman · {roleCounts.EXECUTIVE} Executive
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-navy">{formatAriary(mrr)}</p>
            <p className="text-sm text-text-muted">MRR estimé</p>
            <p className="mt-2 text-xs text-text-muted">
              Abonnement entreprise actif, réparti sur la durée du terme
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            {nextEvent ? (
              <>
                <p className="text-2xl font-bold text-navy">
                  {nextEvent._count.registrations}/{nextEvent.capacity}
                </p>
                <p className="truncate text-sm text-text-muted">Inscrits — {nextEvent.title}</p>
              </>
            ) : (
              <p className="text-sm text-text-muted">Aucun événement à venir</p>
            )}
          </CardContent>
        </Card>
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
                      {formatDateFr(event.date)} · {event.location}
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
