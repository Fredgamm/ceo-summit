import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { buildActivityFeed, buildMonthlyRevenueSeries, computeMRR } from "@/lib/admin-dashboard";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAriary, formatDateFr, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Tableau de bord" };

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

/**
 * E8-T02 — dashboard admin. Every number here is computed from real rows
 * (seed data today, live data once E1/E3 traffic accumulates) — no
 * fabricated deltas ("+12 this month" style trends from the wireframe):
 * there's no historical snapshot to compute those from honestly yet, so
 * they're simply not shown rather than invented.
 */
export default async function AdminDashboardPage() {
  const [
    activeByRole,
    activeMemberships,
    allMembershipsForRevenue,
    paidEventRegistrations,
    pendingApplications,
    pendingEventPayments,
    pendingReports,
    upcomingEvents,
    recentMemberships,
    recentRegistrations,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { status: "ACTIVE" }, _count: { _all: true } }),
    prisma.membership.findMany({
      where: { status: "ACTIVE" },
      select: { price: true, startDate: true, endDate: true },
    }),
    prisma.membership.findMany({ select: { price: true, createdAt: true } }),
    prisma.eventRegistration.findMany({
      where: { paymentStatus: "PAID" },
      select: { createdAt: true, event: { select: { price: true } } },
    }),
    prisma.membershipApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 5,
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
    prisma.membership.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { name: true } } },
    }),
    prisma.eventRegistration.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { name: true } }, event: { select: { title: true } } },
    }),
  ]);

  const activeMembersCount = activeByRole.reduce((sum, r) => sum + r._count._all, 0);
  const roleCounts = Object.fromEntries(activeByRole.map((r) => [r.role, r._count._all]));

  const mrr = computeMRR(activeMemberships);

  const revenueEntries = [
    ...allMembershipsForRevenue.map((m) => ({ amount: m.price, date: m.createdAt })),
    ...paidEventRegistrations.map((r) => ({ amount: r.event.price, date: r.createdAt })),
  ];
  const revenueSeries = buildMonthlyRevenueSeries(revenueEntries, 12);

  const nextEvent = upcomingEvents[0];

  const activity = buildActivityFeed(
    [
      ...recentMemberships.map((m) => ({
        type: "membership",
        message: `Adhésion — ${m.user.name} (${tierLabel(m.tier)}, ${formatAriary(m.price)})`,
        date: m.createdAt,
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
    pendingApplications.length > 0 && {
      label: `${pendingApplications.length} candidature${pendingApplications.length > 1 ? "s" : ""} en attente`,
      href: "/admin/candidatures",
    },
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-navy">{activeMembersCount}</p>
            <p className="text-sm text-text-muted">Membres actifs</p>
            <p className="mt-2 text-xs text-text-muted">
              {roleCounts.CHAIRMAN ?? 0} Chairman · {roleCounts.EXECUTIVE ?? 0} Executive ·{" "}
              {roleCounts.MEMBER ?? 0} Member
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-navy">{formatAriary(mrr)}</p>
            <p className="text-sm text-text-muted">MRR estimé</p>
            <p className="mt-2 text-xs text-text-muted">
              Membership actif, réparti sur la durée du terme
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-navy">{pendingApplications.length}</p>
            <p className="text-sm text-text-muted">Candidatures en attente</p>
            <Link
              href="/admin/candidatures"
              className="mt-2 block text-xs font-semibold text-navy-mid"
            >
              Voir les candidatures →
            </Link>
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
          <CardTitle>Candidatures en attente</CardTitle>
          <Link href="/admin/candidatures" className="text-xs font-semibold text-navy-mid">
            Voir toutes →
          </Link>
        </CardHeader>
        <CardContent>
          {pendingApplications.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune candidature en attente.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingApplications.map((application) => (
                <div key={application.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-navy">{application.fullName}</p>
                    <p className="text-xs text-text-muted">
                      {application.title} · {application.companyName}
                    </p>
                  </div>
                  <Badge variant={TIER_BADGE[application.requestedTier]}>
                    {tierLabel(application.requestedTier)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
