import { describe, expect, it } from "vitest";

import {
  ADMIN_SUBSCRIPTIONS_PAGE_SIZE,
  TO_REVIEW_FILTER,
  TO_REVIEW_WHERE,
  buildAdminSubscriptionsQuery,
} from "./admin-subscriptions-query";

describe("buildAdminSubscriptionsQuery", () => {
  it("returns everything on page 1 without filters", () => {
    expect(buildAdminSubscriptionsQuery({})).toEqual({
      where: {},
      skip: 0,
      take: ADMIN_SUBSCRIPTIONS_PAGE_SIZE,
      page: 1,
    });
  });

  it("paginates and ignores an invalid page", () => {
    expect(buildAdminSubscriptionsQuery({ page: "3" }).skip).toBe(
      2 * ADMIN_SUBSCRIPTIONS_PAGE_SIZE
    );
    expect(buildAdminSubscriptionsQuery({ page: "abc" }).page).toBe(1);
    expect(buildAdminSubscriptionsQuery({ page: "-2" }).page).toBe(1);
  });

  it("filters by a valid status and ignores an unknown one", () => {
    expect(buildAdminSubscriptionsQuery({ statut: "PENDING_PAYMENT" }).where).toEqual({
      AND: [{ status: "PENDING_PAYMENT" }],
    });
    expect(buildAdminSubscriptionsQuery({ statut: "NIMPORTE" }).where).toEqual({});
  });

  it("« à valider » includes pending upsells", () => {
    expect(buildAdminSubscriptionsQuery({ statut: TO_REVIEW_FILTER }).where).toEqual({
      AND: [TO_REVIEW_WHERE],
    });
  });

  it("combines offer and search on company, manager name and email", () => {
    const { where } = buildAdminSubscriptionsQuery({ offre: "plan_1", q: "  rakoto " });
    expect(where).toEqual({
      AND: [
        { planId: "plan_1" },
        {
          OR: [
            { company: { name: { contains: "rakoto", mode: "insensitive" } } },
            { company: { companyAdmin: { name: { contains: "rakoto", mode: "insensitive" } } } },
            { company: { companyAdmin: { email: { contains: "rakoto", mode: "insensitive" } } } },
          ],
        },
      ],
    });
  });
});
