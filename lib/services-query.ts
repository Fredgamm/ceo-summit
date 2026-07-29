import type { Prisma, Tier } from "@prisma/client";

import { SERVICE_CATEGORIES } from "@/lib/service-categories";
import { COUNTRIES } from "@/lib/countries";

/** E5-T01 — pure filter/pagination logic for `/catalogue/services`, same rationale as lib/deal-room-query.ts. */

export const SERVICES_PAGE_SIZE = 12;

const TIER_VALUES: Tier[] = ["MEMBER", "EXECUTIVE", "CHAIRMAN"];

export interface ServicesSearchParams {
  categorie?: string;
  pays?: string;
  tier?: string;
  q?: string;
  page?: string;
}

export interface ServicesQuery {
  where: Prisma.ServiceListingWhereInput;
  skip: number;
  take: number;
  page: number;
}

/**
 * Backlog: "Filtres : catégorie, pays, tier" — "pays" and "tier" describe
 * the provider (company/author), not the listing itself, since
 * ServiceListing has no country/tier field of its own. "pays" falls back to
 * the author's own country when the listing isn't tied to a company.
 */
export function buildServicesQuery(params: ServicesSearchParams): ServicesQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const where: Prisma.ServiceListingWhereInput = { status: "PUBLISHED" };

  if (params.categorie && (SERVICE_CATEGORIES as readonly string[]).includes(params.categorie)) {
    where.category = params.categorie;
  }

  if (params.pays && (COUNTRIES as readonly string[]).includes(params.pays)) {
    where.OR = [
      { company: { country: params.pays } },
      { companyId: null, author: { country: params.pays } },
    ];
  }

  if (params.tier && TIER_VALUES.includes(params.tier as Tier)) {
    where.author = { memberships: { some: { status: "ACTIVE", tier: params.tier as Tier } } };
  }

  if (params.q?.trim()) {
    where.title = { contains: params.q.trim(), mode: "insensitive" };
  }

  return {
    where,
    skip: (page - 1) * SERVICES_PAGE_SIZE,
    take: SERVICES_PAGE_SIZE,
    page,
  };
}
