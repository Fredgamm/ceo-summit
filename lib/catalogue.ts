import type { Prisma, Role } from "@prisma/client";

/**
 * E2-T03 — pure query-building logic for `/catalogue`, kept separate from
 * the page component so the filter/sort/pagination rules are unit-testable
 * without touching Prisma. `role` doubles as "current tier" here: the Evolia
 * webhook (E1-T02) keeps User.role in sync with the active Membership.tier,
 * so filtering/sorting on it is both correct and a plain indexed column —
 * no relation-based orderBy needed for the "tier" sort.
 */

export const CATALOGUE_PAGE_SIZE = 12;

const VALID_TIERS = ["MEMBER", "EXECUTIVE", "CHAIRMAN"] as const;

export interface CatalogueSearchParams {
  secteur?: string;
  pays?: string;
  tier?: string;
  q?: string;
  tri?: string;
  page?: string;
}

export interface CatalogueQuery {
  where: Prisma.UserWhereInput;
  orderBy: Prisma.UserOrderByWithRelationInput;
  skip: number;
  take: number;
  page: number;
}

export function buildCatalogueQuery(
  params: CatalogueSearchParams,
  referentials: { validSectors: readonly string[]; validCountries: readonly string[] }
): CatalogueQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const where: Prisma.UserWhereInput = { status: "ACTIVE" };

  if (params.secteur && referentials.validSectors.includes(params.secteur)) {
    where.sectors = { has: params.secteur };
  }
  if (params.pays && referentials.validCountries.includes(params.pays)) {
    where.country = params.pays;
  }
  if (params.tier && (VALID_TIERS as readonly string[]).includes(params.tier)) {
    where.role = params.tier as Role;
  }
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { company: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  /**
   * Rapport QA du 30 sept. 2026 — tri par défaut demandé : l'offre la plus
   * chère (tier d'abonnement de l'entreprise) en premier, plutôt que
   * l'activité récente. `company`/`subscription`/`plan` sont tous des
   * relations "to-one", Prisma peut trier sur un champ imbriqué à plusieurs
   * niveaux sans requête séparée.
   */
  const orderBy: Prisma.UserOrderByWithRelationInput =
    params.tri === "alpha"
      ? { name: "asc" }
      : params.tri === "tier"
        ? { role: "desc" }
        : params.tri === "recent"
          ? { createdAt: "desc" }
          : { company: { subscription: { plan: { priceAr: "desc" } } } };

  return {
    where,
    orderBy,
    skip: (page - 1) * CATALOGUE_PAGE_SIZE,
    take: CATALOGUE_PAGE_SIZE,
    page,
  };
}
