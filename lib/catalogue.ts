import type { Prisma, Role } from "@prisma/client";

import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";

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

export function buildCatalogueQuery(params: CatalogueSearchParams): CatalogueQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const where: Prisma.UserWhereInput = { status: "ACTIVE" };

  if (params.secteur && (SECTORS as readonly string[]).includes(params.secteur)) {
    where.sectors = { has: params.secteur };
  }
  if (params.pays && (COUNTRIES as readonly string[]).includes(params.pays)) {
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

  const orderBy: Prisma.UserOrderByWithRelationInput =
    params.tri === "alpha"
      ? { name: "asc" }
      : params.tri === "tier"
        ? { role: "desc" }
        : { createdAt: "desc" };

  return {
    where,
    orderBy,
    skip: (page - 1) * CATALOGUE_PAGE_SIZE,
    take: CATALOGUE_PAGE_SIZE,
    page,
  };
}
