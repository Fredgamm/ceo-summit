import type { Prisma, MembershipStatus } from "@prisma/client";

import { NOT_STAFF_WHERE } from "@/lib/plan-access";

/** E8-T04 — pure query-building logic for `/admin/membres`, same rationale as lib/catalogue.ts. */

export const ADMIN_MEMBERS_PAGE_SIZE = 20;

const VALID_STATUSES: MembershipStatus[] = [
  "ACTIVE",
  "PENDING_ACTIVATION",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
];

export interface AdminMembersSearchParams {
  q?: string;
  pays?: string;
  secteur?: string;
  statut?: string;
  /** « 1 » : inclut le staff (CEO Summit, BECOM), masqué par défaut. */
  staff?: string;
  page?: string;
}

export interface AdminMembersQuery {
  where: Prisma.UserWhereInput;
  skip: number;
  take: number;
  page: number;
}

export function buildAdminMembersQuery(
  params: AdminMembersSearchParams,
  referentials: { validSectors: readonly string[]; validCountries: readonly string[] }
): AdminMembersQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const where: Prisma.UserWhereInput = params.staff === "1" ? {} : { ...NOT_STAFF_WHERE };

  if (params.pays && referentials.validCountries.includes(params.pays)) {
    where.country = params.pays;
  }
  if (params.secteur && referentials.validSectors.includes(params.secteur)) {
    where.sectors = { has: params.secteur };
  }
  if (params.statut && VALID_STATUSES.includes(params.statut as MembershipStatus)) {
    where.status = params.statut as MembershipStatus;
  }
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }

  return { where, skip: (page - 1) * ADMIN_MEMBERS_PAGE_SIZE, take: ADMIN_MEMBERS_PAGE_SIZE, page };
}
