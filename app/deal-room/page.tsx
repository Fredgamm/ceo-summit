import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Diamond } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildDealRoomQuery,
  DEAL_ROOM_PAGE_SIZE,
  type DealRoomSearchParams,
} from "@/lib/deal-room-query";
import { getDealRoomContactCost } from "@/lib/deal-room-settings";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { DealRoomFilters } from "@/components/deal-room/deal-room-filters";
import { OpportunityCard } from "@/components/deal-room/opportunity-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Deal Room" };

/** E6-T01 — liste opportunités, visibilité par tier (lib/deal-room-query.ts). */
export default async function DealRoomPage({
  searchParams,
}: {
  searchParams: DealRoomSearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { creditBalance: true, ...VIEWER_TIER_INCLUDE },
  });
  if (!viewer) redirect("/login");

  const viewerTier = getViewerTierFromCompany(viewer.company);
  const [validTypes, validSectors, validCountries, contactCost] = await Promise.all([
    getReferentialLabels("opportunity_type"),
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
    getDealRoomContactCost(),
  ]);
  const { where, orderBy, skip, take, page } = buildDealRoomQuery(searchParams, viewerTier, {
    validTypes,
    validSectors,
    validCountries,
  });

  const [opportunities, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        author: {
          select: {
            name: true,
            title: true,
            avatarUrl: true,
            role: true,
            ...VIEWER_TIER_INCLUDE,
          },
        },
      },
    }),
    prisma.opportunity.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / DEAL_ROOM_PAGE_SIZE));
  const available =
    viewer.role === "CHAIRMAN"
      ? null
      : viewer.creditBalance
        ? viewer.creditBalance.included + viewer.creditBalance.purchased - viewer.creditBalance.used
        : 0;
  const unreadMessages = await countUnreadMessages(viewer.id);

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewerTier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Deal Room</h1>
        <Button asChild>
          <Link href="/deal-room/publier">+ Publier une opportunité</Link>
        </Button>
      </div>

      <Alert variant="gold" className="mb-4">
        <Diamond />
        <AlertDescription>
          <strong>Crédits disponibles : {available === null ? "Illimité" : available}</strong> —{" "}
          {contactCost === 0
            ? "La prise de contact est gratuite pour l'instant."
            : `Chaque prise de contact coûte ${contactCost} crédit.`}{" "}
          Les membres Chairman ont un accès illimité.{" "}
          <Link href="/credits/acheter" className="font-semibold text-navy underline">
            Acheter des crédits →
          </Link>
        </AlertDescription>
      </Alert>

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
              deadline={opp.deadline}
              createdAt={opp.createdAt}
              author={{
                name: opp.author.name,
                title: opp.author.title,
                avatarUrl: opp.author.avatarUrl,
                role: opp.author.role,
              }}
              authorTier={getViewerTierFromCompany(opp.author.company)}
              contactCost={contactCost}
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
