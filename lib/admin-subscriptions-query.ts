import type { CompanySubscriptionStatus, Prisma } from "@prisma/client";

/**
 * 24 nov. 2026 — filtres et pagination du tableau « Abonnements » de
 * /admin/entreprises (même principe que lib/admin-members-query.ts) : la
 * liste complète devenait trop longue à parcourir.
 */

export const ADMIN_SUBSCRIPTIONS_PAGE_SIZE = 20;

/** Statut « à valider » : abonnement en revue, ou supplément de places en attente. */
export const TO_REVIEW_FILTER = "A_VALIDER";

const VALID_STATUSES: CompanySubscriptionStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PENDING_REVIEW",
  "ACTIVE",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
];

/** Abonnements à valider : en revue, ou avec un paiement (supplément) en attente. */
export const TO_REVIEW_WHERE: Prisma.CompanySubscriptionWhereInput = {
  OR: [{ status: "PENDING_REVIEW" }, { payments: { some: { status: "PENDING" } } }],
};

export interface AdminSubscriptionsSearchParams {
  q?: string;
  statut?: string;
  offre?: string;
  page?: string;
}

export interface AdminSubscriptionsQuery {
  where: Prisma.CompanySubscriptionWhereInput;
  skip: number;
  take: number;
  page: number;
}

export function buildAdminSubscriptionsQuery(
  params: AdminSubscriptionsSearchParams
): AdminSubscriptionsQuery {
  const parsedPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const conditions: Prisma.CompanySubscriptionWhereInput[] = [];

  if (params.statut === TO_REVIEW_FILTER) {
    conditions.push(TO_REVIEW_WHERE);
  } else if (params.statut && VALID_STATUSES.includes(params.statut as CompanySubscriptionStatus)) {
    conditions.push({ status: params.statut as CompanySubscriptionStatus });
  }
  if (params.offre) conditions.push({ planId: params.offre });
  if (params.q?.trim()) {
    const q = params.q.trim();
    conditions.push({
      OR: [
        { company: { name: { contains: q, mode: "insensitive" } } },
        { company: { companyAdmin: { name: { contains: q, mode: "insensitive" } } } },
        { company: { companyAdmin: { email: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  return {
    where: conditions.length > 0 ? { AND: conditions } : {},
    skip: (page - 1) * ADMIN_SUBSCRIPTIONS_PAGE_SIZE,
    take: ADMIN_SUBSCRIPTIONS_PAGE_SIZE,
    page,
  };
}
