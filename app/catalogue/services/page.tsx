import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildServicesQuery,
  SERVICES_PAGE_SIZE,
  type ServicesSearchParams,
} from "@/lib/services-query";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { ServiceFilters } from "@/components/catalogue-services/service-filters";
import { ServiceCard } from "@/components/catalogue-services/service-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Catalogue de services" };

/** E5-T01 — liste des fiches services, filtrées par catégorie/pays/tier du prestataire. */
export default async function ServicesCataloguePage({
  searchParams,
}: {
  searchParams: ServicesSearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const validCountries = await getReferentialLabels("country");
  const { where, skip, take, page } = buildServicesQuery(searchParams, validCountries);

  const [listings, total] = await Promise.all([
    prisma.serviceListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        author: { select: { name: true, avatarUrl: true } },
        company: { select: { name: true } },
      },
    }),
    prisma.serviceListing.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / SERVICES_PAGE_SIZE));
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
        <h1 className="text-xl font-bold text-navy">Catalogue de services</h1>
        <Button asChild>
          <Link href="/catalogue/services/publier">+ Déposer une fiche</Link>
        </Button>
      </div>

      <ServiceFilters countries={validCountries} />

      {listings.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Aucune fiche trouvée"
          description="Essayez d'autres filtres."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ServiceCard
              key={listing.id}
              id={listing.id}
              title={listing.title}
              description={listing.description}
              category={listing.category}
              priceInfo={listing.priceInfo}
              gallery={listing.gallery}
              createdAt={listing.createdAt}
              provider={{
                name: listing.author.name,
                avatarUrl: listing.author.avatarUrl,
                companyName: listing.company?.name ?? null,
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

function buildPageLink(searchParams: ServicesSearchParams, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/catalogue/services?${params.toString()}`;
}
