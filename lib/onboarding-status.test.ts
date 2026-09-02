import { describe, expect, it } from "vitest";

import { getOnboardingStatus } from "./onboarding-status";

describe("getOnboardingStatus", () => {
  it("marks only the account as done right after signup, before any company", () => {
    const items = getOnboardingStatus({
      hasCompany: false,
      hasInvites: false,
      subscriptionStatus: null,
    });
    const done = items.filter((i) => i.done).map((i) => i.key);
    expect(done).toEqual(["account"]);
  });

  it("marks the company done before any offer is chosen (ordre inversé, 5 août 2026)", () => {
    const items = getOnboardingStatus({
      hasCompany: true,
      hasInvites: false,
      subscriptionStatus: null,
    });
    const done = items.filter((i) => i.done).map((i) => i.key);
    expect(done).toEqual(["account", "company"]);
  });

  it("marks the plan done once an offer is chosen (PENDING_PAYMENT)", () => {
    const items = getOnboardingStatus({
      hasCompany: true,
      hasInvites: false,
      subscriptionStatus: "PENDING_PAYMENT",
    });
    const done = items.filter((i) => i.done).map((i) => i.key);
    expect(done).toEqual(["account", "company", "plan"]);
  });

  it("marks payment-submitted and admin-review together at PENDING_REVIEW", () => {
    const items = getOnboardingStatus({
      hasCompany: true,
      hasInvites: true,
      subscriptionStatus: "PENDING_REVIEW",
    });
    const done = items.filter((i) => i.done).map((i) => i.key);
    expect(done).toEqual([
      "account",
      "company",
      "plan",
      "collaborators",
      "payment_submitted",
      "admin_review",
      "invitations_sent",
    ]);
  });

  it("marks every item done once the subscription is ACTIVE", () => {
    const items = getOnboardingStatus({
      hasCompany: true,
      hasInvites: true,
      subscriptionStatus: "ACTIVE",
    });
    expect(items.every((i) => i.done)).toBe(true);
  });

  /**
   * Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
   * RG-12 : EXPIRED ne concerne que l'accès à l'édition d'évènement, les
   * avantages plateforme (et donc l'onboarding lui-même) restent actifs.
   */
  it("still marks every item done once the subscription is EXPIRED (RG-12)", () => {
    const items = getOnboardingStatus({
      hasCompany: true,
      hasInvites: true,
      subscriptionStatus: "EXPIRED",
    });
    expect(items.every((i) => i.done)).toBe(true);
  });
});
