import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { buildActiveOpportunitiesWhere } from "@/lib/admin-deal-room-query";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import {
  QuickApproveButton,
  RepublishButton,
  UnpublishButton,
} from "@/components/admin/deal-room/opportunity-quick-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAriary, formatEuro, formatDateFr, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Deal Room" };

const TABS = [
  { key: "moderation", label: "À valider" },
  { key: "actives", label: "Actives" },
  { key: "archivees", label: "Archivées" },
];

const ARCHIVE_STATUSES = ["UNPUBLISHED", "REFUSED", "EXPIRED"] as const;

const STATUS_BADGE: Record<string, "pending" | "approved" | "refused" | "draft"> = {
  UNPUBLISHED: "draft",
  REFUSED: "refused",
  EXPIRED: "draft",
};

const STATUS_LABEL: Record<string, string> = {
  UNPUBLISHED: "Dépubliée",
  REFUSED: "Refusée",
  EXPIRED: "Expirée",
};

/** E8-T06 — file de modération Deal Room : à valider / actives / archivées. */
export default async function AdminDealRoomPage(props: {
  searchParams: Promise<{ tab?: string; q?: string; type?: string; sector?: string }>;
}) {
  const searchParams = await props.searchParams;
  try {
    await requireAdmin("deal-room");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const activeTab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "moderation";
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [pendingCount, activeCount, contactsThisMonth, refusedThisMonth, validTypes, validSectors] =
    await Promise.all([
      prisma.opportunity.count({ where: { status: "PENDING_MODERATION" } }),
      prisma.opportunity.count({ where: { status: "PUBLISHED" } }),
      prisma.opportunityContact.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.opportunity.count({
        where: { status: "REFUSED", moderatedAt: { gte: startOfMonth } },
      }),
      getReferentialLabels("opportunity_type"),
      getReferentialLabels("sector"),
    ]);

  const authorSelect = {
    select: {
      name: true,
      title: true,
      avatarUrl: true,
      ...VIEWER_TIER_INCLUDE,
    },
  };

  const pending =
    activeTab === "moderation"
      ? await prisma.opportunity.findMany({
          where: { status: "PENDING_MODERATION" },
          orderBy: { createdAt: "asc" },
          include: { author: authorSelect },
        })
      : [];

  const active =
    activeTab === "actives"
      ? await prisma.opportunity.findMany({
          where: buildActiveOpportunitiesWhere(searchParams, { validTypes, validSectors }),
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } }, _count: { select: { contacts: true } } },
        })
      : [];

  const archived =
    activeTab === "archivees"
      ? await prisma.opportunity.findMany({
          where: { status: { in: [...ARCHIVE_STATUSES] } },
          orderBy: { updatedAt: "desc" },
          include: { author: { select: { name: true } } },
        })
      : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-navy">Deal Room — Modération</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-red-600">{pendingCount}</p>
          <p className="text-xs text-text-muted">En attente de validation</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
          <p className="text-xs text-text-muted">Opportunités actives</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-navy">{contactsThisMonth}</p>
          <p className="text-xs text-text-muted">Contacts initiés ce mois</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-2xl font-bold text-gold">{refusedThisMonth}</p>
          <p className="text-xs text-text-muted">Refusées ce mois</p>
        </div>
      </div>

      <div className="flex gap-1 border-b-2 border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/deal-room?tab=${tab.key}`}
            className={`-mb-0.5 border-b-2 px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key ? "border-navy text-navy" : "border-transparent text-text-muted"
            }`}
          >
            {tab.label}
            {tab.key === "moderation" && pendingCount > 0 && ` (${pendingCount})`}
          </Link>
        ))}
      </div>

      {activeTab === "moderation" &&
        (pending.length === 0 ? (
          <EmptyState title="Aucune opportunité en attente" />
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((opp) => (
              <div
                key={opp.id}
                className="flex items-start gap-4 rounded-lg border border-border bg-white p-5"
              >
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{opp.type}</Badge>
                    <Badge variant="secondary">{opp.sector}</Badge>
                    <Badge variant="secondary">{opp.country}</Badge>
                  </div>
                  <p className="mb-1.5 font-bold text-navy">{opp.title}</p>
                  <p className="mb-3 line-clamp-2 text-sm text-text-mid">{opp.description}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={opp.author.avatarUrl ?? undefined} alt={opp.author.name} />
                      <AvatarFallback>{initials(opp.author.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-navy">{opp.author.name}</span>
                    <span>· Soumis le {formatDateFr(opp.createdAt)}</span>
                    {opp.budget != null && <span>· {formatAriary(opp.budget)}</span>}
                    {opp.budgetEur != null && <span>· {formatEuro(opp.budgetEur)}</span>}
                  </div>
                </div>
                <div className="flex min-w-[140px] flex-col gap-2">
                  <Button asChild variant="outline" size="sm" className="justify-center">
                    <Link href={`/admin/deal-room/${opp.id}`}>Examiner →</Link>
                  </Button>
                  <QuickApproveButton opportunityId={opp.id} />
                </div>
              </div>
            ))}
          </div>
        ))}

      {activeTab === "actives" &&
        (active.length === 0 ? (
          <EmptyState title="Aucune opportunité active" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Opportunité</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Publié par</th>
                  <th className="px-4 py-2.5 text-left">Date publi.</th>
                  <th className="px-4 py-2.5 text-left">Contacts</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((opp) => (
                  <tr key={opp.id}>
                    <td className="px-4 py-3 font-semibold text-navy">{opp.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{opp.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{opp.author.name}</td>
                    <td className="px-4 py-3 text-text-muted">{formatDateFr(opp.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold">{opp._count.contacts}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/admin/deal-room/${opp.id}`}>Voir</Link>
                        </Button>
                        <UnpublishButton opportunityId={opp.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {activeTab === "archivees" &&
        (archived.length === 0 ? (
          <EmptyState title="Aucune opportunité archivée" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Opportunité</th>
                  <th className="px-4 py-2.5 text-left">Auteur</th>
                  <th className="px-4 py-2.5 text-left">Statut</th>
                  <th className="px-4 py-2.5 text-left">Mise à jour</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {archived.map((opp) => (
                  <tr key={opp.id}>
                    <td className="px-4 py-3 font-semibold text-navy">{opp.title}</td>
                    <td className="px-4 py-3 text-text-muted">{opp.author.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[opp.status] ?? "draft"}>
                        {STATUS_LABEL[opp.status] ?? opp.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDateFr(opp.updatedAt)}</td>
                    <td className="px-4 py-3">
                      {opp.status === "UNPUBLISHED" && <RepublishButton opportunityId={opp.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
