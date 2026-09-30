import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildCatalogueQuery,
  CATALOGUE_PAGE_SIZE,
  type CatalogueSearchParams,
} from "@/lib/catalogue";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { CatalogueFilters } from "@/components/catalogue/catalogue-filters";
import { MemberCard } from "@/components/catalogue/member-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Liste des membres" };

/**
 * E2-T03 — accès réservé aux membres actifs : déjà garanti par middleware.ts
 * (statut ACTIVE requis sur toute route non publique) — pas de vérification
 * supplémentaire nécessaire ici.
 */
export default async function CataloguePage({
  searchParams,
}: {
  searchParams: CatalogueSearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const [validSectors, validCountries] = await Promise.all([
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);
  const { where, orderBy, skip, take, page } = buildCatalogueQuery(searchParams, {
    validSectors,
    validCountries,
  });

  const [members, total, topOffer] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        company: { select: { name: true, subscription: { select: { plan: true } } } },
      },
    }),
    prisma.user.count({ where }),
    // Rapport QA du 30 sept. 2026 (§11) — met en avant la carte de l'offre
    // la plus chère actuellement souscrite, calculé dynamiquement plutôt
    // qu'une offre nommée en dur : reste correct si les offres changent.
    prisma.plan.aggregate({ _max: { priceAr: true } }),
  ]);
  const topOfferPriceAr = topOffer._max.priceAr;

  const totalPages = Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE));
  const unreadMessages = await countUnreadMessages(viewer.id);

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(getViewerTierFromCompany(viewer.company)),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Liste des membres</h1>
        <span className="text-sm text-text-muted">
          {total} membre{total !== 1 ? "s" : ""} affiché{total !== 1 ? "s" : ""}
        </span>
      </div>

      <CatalogueFilters sectors={validSectors} countries={validCountries} />

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun membre trouvé"
          description="Essayez d'autres filtres ou secteurs."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <MemberCard
              key={m.id}
              id={m.id}
              name={m.name}
              title={m.title}
              companyName={m.company?.name ?? null}
              country={m.country}
              avatarUrl={m.avatarUrl}
              role={m.role}
              offerName={m.company?.subscription?.plan.name ?? null}
              isTopOffer={
                topOfferPriceAr != null && m.company?.subscription?.plan.priceAr === topOfferPriceAr
              }
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

function buildPageLink(searchParams: CatalogueSearchParams, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/catalogue?${params.toString()}`;
}
