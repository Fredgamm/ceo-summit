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

  it("marks offer+company done together once the company exists (PENDING_PAYMENT)", () => {
    const items = getOnboardingStatus({
      hasCompany: true,
      hasInvites: false,
      subscriptionStatus: "PENDING_PAYMENT",
    });
    const done = items.filter((i) => i.done).map((i) => i.key);
    expect(done).toEqual(["account", "plan", "company"]);
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
      "plan",
      "company",
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
});
