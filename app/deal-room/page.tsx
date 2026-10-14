import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Diamond } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildDealRoomQuery,
  DEAL_ROOM_PAGE_SIZE,
  DEFAULT_SORT_SCAN_LIMIT,
  isDefaultSort,
  sortByCompanyRelevance,
  type DealRoomSearchParams,
} from "@/lib/deal-room-query";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { DealRoomFilters } from "@/components/deal-room/deal-room-filters";
import { OpportunityCard } from "@/components/deal-room/opportunity-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AddButton } from "@/components/ui/add-button";

export const metadata: Metadata = { title: "Deal Room" };

/** E6-T01 — liste des opportunités publiées, visible par tout membre actif. */
export default async function DealRoomPage(props: { searchParams: Promise<DealRoomSearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const viewerTier = getViewerTierFromCompany(viewer.company);
  const [validTypes, validSectors, validCountries] = await Promise.all([
    getReferentialLabels("opportunity_type"),
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);
  const { where, orderBy, skip, take, page } = buildDealRoomQuery(searchParams, viewerTier, {
    validTypes,
    validSectors,
    validCountries,
  });

  const authorInclude = {
    author: {
      select: {
        name: true,
        title: true,
        avatarUrl: true,
        role: true,
        companyId: true,
        ...VIEWER_TIER_INCLUDE,
      },
    },
  };

  // Rapport QA 1er oct. §2.4 — tri par défaut : mes opportunités d'abord,
  // puis celles d'entreprises du même secteur (voir sortByCompanyRelevance).
  // Un tri explicite (budget/échéance) reste un choix de l'utilisateur,
  // jamais réordonné.
  const [opportunities, total] = isDefaultSort(searchParams)
    ? await Promise.all([
        prisma.opportunity
          .findMany({
            where,
            orderBy,
            take: DEFAULT_SORT_SCAN_LIMIT,
            include: authorInclude,
          })
          .then((all) =>
            sortByCompanyRelevance(
              all.map((o) => ({
                ...o,
                authorCompanyId: o.author.companyId,
                authorCompanySector: o.author.company?.sector ?? null,
              })),
              viewer.companyId,
              viewer.company?.sector ?? null
            ).slice(skip, skip + take)
          ),
        prisma.opportunity.count({ where }),
      ])
    : await Promise.all([
        prisma.opportunity.findMany({ where, orderBy, skip, take, include: authorInclude }),
        prisma.opportunity.count({ where }),
      ]);

  const totalPages = Math.max(1, Math.ceil(total / DEAL_ROOM_PAGE_SIZE));
  const unreadMessages = await countUnreadMessages(viewer.id);

  return (
    <AppShell
      user={{
        name: viewer.name,
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Deal Room</h1>
        <AddButton href="/deal-room/publier">Publier une opportunité</AddButton>
      </div>

      <DealRoomFilters types={validTypes} sectors={validSectors} countries={validCountries} />

      {opportunities.length === 0 ? (
        <EmptyState
          icon={Diamond}
          title="Aucune opportunité trouvée"
          description="Essayez d'autres filtres."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {opportunities.map((opp) => (
            <OpportunityCard
              key={opp.id}
              id={opp.id}
              title={opp.title}
              description={opp.description}
              type={opp.type}
              sector={opp.sector}
              budget={opp.budget}
              budgetEur={opp.budgetEur}
              deadline={opp.deadline}
              createdAt={opp.createdAt}
              author={{
                name: opp.author.name,
                title: opp.author.title,
                avatarUrl: opp.author.avatarUrl,
                role: opp.author.role,
              }}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildPageLink(searchParams, page - 1)}>Précédent</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Précédent
            </Button>
          )}
          <span className="text-sm text-text-muted">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildPageLink(searchParams, page + 1)}>Suivant</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Suivant
            </Button>
          )}
        </div>
      )}
    </AppShell>
  );
}

function buildPageLink(searchParams: DealRoomSearchParams, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/deal-room?${params.toString()}`;
}
