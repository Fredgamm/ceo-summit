import type { Prisma } from "@prisma/client";
import { MEMBER_WITH_ACCESS_WHERE, NOT_STAFF_WHERE } from "@/lib/plan-access";

/**
 * E2-T03 — pure query-building logic for `/catalogue`, kept separate from
 * the page component so the filter/sort/pagination rules are unit-testable
 * without touching Prisma.
 */

export const CATALOGUE_PAGE_SIZE = 12;

export interface CatalogueSearchParams {
  secteur?: string;
  pays?: string;
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
  referentials: { validSectors: readonly string[]; validCountries: readonly string[] },
  options: { showStaff?: boolean } = {}
): CatalogueQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const where: Prisma.UserWhereInput = {
    ...MEMBER_WITH_ACCESS_WHERE,
    ...(options.showStaff ? {} : NOT_STAFF_WHERE),
  };

  if (params.secteur && referentials.validSectors.includes(params.secteur)) {
    where.sectors = { has: params.secteur };
  }
  if (params.pays && referentials.validCountries.includes(params.pays)) {
    where.country = params.pays;
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
