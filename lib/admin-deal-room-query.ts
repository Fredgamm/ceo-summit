import type { Prisma, OpportunityType } from "@prisma/client";

import { SECTORS } from "@/lib/sectors";

/** E8-T06 — onglet "Actives" de /admin/deal-room : recherche/type/secteur parmi les opportunités publiées. */

const VALID_TYPES: OpportunityType[] = [
  "PARTENARIAT",
  "INVESTISSEMENT",
  "APPEL_OFFRES",
  "LEVEE_FONDS",
  "JOINT_VENTURE",
];

export interface AdminActiveOpportunitiesParams {
  q?: string;
  type?: string;
  sector?: string;
}

export function buildActiveOpportunitiesWhere(
  params: AdminActiveOpportunitiesParams
): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = { status: "PUBLISHED" };

  if (params.q?.trim()) {
    where.title = { contains: params.q.trim(), mode: "insensitive" };
  }
  if (params.type && VALID_TYPES.includes(params.type as OpportunityType)) {
    where.type = params.type as OpportunityType;
  }
  if (params.sector && (SECTORS as readonly string[]).includes(params.sector)) {
    where.sector = params.sector;
  }

  return where;
}
