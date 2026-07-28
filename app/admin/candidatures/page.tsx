import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateFr, tierLabel } from "@/lib/utils";
import type { ApplicationStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Admin — Candidatures" };

const TABS: { key: string; label: string; status?: ApplicationStatus }[] = [
  { key: "pending", label: "En attente", status: "PENDING" },
  { key: "approved", label: "Validées", status: "APPROVED" },
  { key: "refused", label: "Refusées", status: "REFUSED" },
  { key: "all", label: "Toutes" },
];

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

const STATUS_BADGE: Record<ApplicationStatus, "pending" | "approved" | "refused"> = {
  PENDING: "pending",
  APPROVED: "approved",
  REFUSED: "refused",
};

/** E8-T03 — liste candidatures avec tabs par statut. */
export default async function AdminCandidaturesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  try {
    await requireAdmin("candidatures");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const activeTab = TABS.find((t) => t.key === searchParams.tab) ?? TABS[0];

  const [applications, counts] = await Promise.all([
    prisma.membershipApplication.findMany({
      where: activeTab.status ? { status: activeTab.status } : undefined,
      orderBy: { createdAt: "asc" },
    }),
    prisma.membershipApplication.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex border-b-2 border-border">
        {TABS.map((tab) => {
          const count = tab.status
            ? (countByStatus[tab.status] ?? 0)
            : counts.reduce((s, c) => s + c._count._all, 0);
          return (
            <Link
              key={tab.key}
              href={`/admin/candidatures?tab=${tab.key}`}
              className={`-mb-0.5 border-b-2 px-4 py-2.5 text-sm font-semibold ${
                activeTab.key === tab.key
                  ? "border-navy text-navy"
                  : "border-transparent text-text-muted hover:text-text-mid"
              }`}
            >
              {tab.label} <span className="text-xs font-normal">({count})</span>
            </Link>
          );
        })}
      </div>

      {applications.length === 0 ? (
        <EmptyState title="Aucune candidature dans cette catégorie" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Candidat</th>
                <th className="px-4 py-2.5 text-left">Entreprise & poste</th>
                <th className="px-4 py-2.5 text-left">Tier demandé</th>
                <th className="px-4 py-2.5 text-left">Soumis le</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {applications.map((application) => (
                <tr key={application.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy">{application.fullName}</p>
                    <p className="text-xs text-text-muted">{application.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{application.title}</p>
                    <p className="text-xs text-text-muted">{application.companyName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={TIER_BADGE[application.requestedTier]}>
                      {tierLabel(application.requestedTier)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {formatDateFr(application.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[application.status]}>
                      {TABS.find((t) => t.status === application.status)?.label ??
                        application.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/candidatures/${application.id}`}
                      className="text-xs font-semibold text-navy-mid"
                    >
                      Examiner →
                    </Link>
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
