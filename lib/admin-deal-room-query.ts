import type { Prisma } from "@prisma/client";

/** E8-T06 — onglet "Actives" de /admin/deal-room : recherche/type/secteur parmi les opportunités publiées. */

export interface AdminActiveOpportunitiesParams {
  q?: string;
  type?: string;
  sector?: string;
}

/**
 * `type`/`sector` (référentiels admin-éditables depuis le 5 août 2026,
 * E8-T11 — voir lib/referentials-query.ts) ne sont plus des listes figées à
 * la compilation : l'appelant (page) récupère la liste actuelle et la
 * transmet ici, pour ignorer une valeur de filtre qui ne correspond plus à
 * rien plutôt que de la passer telle quelle à Prisma.
 */
export function buildActiveOpportunitiesWhere(
  params: AdminActiveOpportunitiesParams,
  referentials: { validTypes: readonly string[]; validSectors: readonly string[] }
): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = { status: "PUBLISHED" };

  if (params.q?.trim()) {
    where.title = { contains: params.q.trim(), mode: "insensitive" };
  }
  if (params.type && referentials.validTypes.includes(params.type)) {
    where.type = params.type;
  }
  if (params.sector && referentials.validSectors.includes(params.sector)) {
    where.sector = params.sector;
  }

  return where;
}
