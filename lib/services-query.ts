import type { Prisma } from "@prisma/client";

import { SERVICE_CATEGORIES } from "@/lib/service-categories";

/** E5-T01 — pure filter/pagination logic for `/catalogue/services`, same rationale as lib/deal-room-query.ts. */

export const SERVICES_PAGE_SIZE = 12;

export interface ServicesSearchParams {
  categorie?: string;
  pays?: string;
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
 * "pays" describes the provider (company/author), not the listing itself,
 * since ServiceListing has no country field of its own. It falls back to the
 * author's own country when the listing isn't tied to a company.
 */
export function buildServicesQuery(
  params: ServicesSearchParams,
  validCountries: readonly string[]
): ServicesQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const where: Prisma.ServiceListingWhereInput = { status: "PUBLISHED" };

  if (params.categorie && (SERVICE_CATEGORIES as readonly string[]).includes(params.categorie)) {
    where.category = params.categorie;
  }

  if (params.pays && validCountries.includes(params.pays)) {
    where.OR = [
      { company: { country: params.pays } },
      { companyId: null, author: { country: params.pays } },
    ];
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
