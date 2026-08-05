import { describe, expect, it } from "vitest";

import { computeEffectiveStatus } from "./company-subscription-status";

describe("computeEffectiveStatus", () => {
  const now = new Date("2027-01-15");

  it("flips ACTIVE to EXPIRED once the linked event's date is in the past", () => {
    expect(computeEffectiveStatus("ACTIVE", new Date("2026-11-15"), now)).toBe("EXPIRED");
  });

  it("keeps ACTIVE when the linked event is still upcoming", () => {
    expect(computeEffectiveStatus("ACTIVE", new Date("2027-06-15"), now)).toBe("ACTIVE");
  });

  it("keeps ACTIVE when there is no linked event (platform-only plan)", () => {
    expect(computeEffectiveStatus("ACTIVE", null, now)).toBe("ACTIVE");
  });

  it("leaves non-ACTIVE statuses untouched regardless of the event date", () => {
    expect(computeEffectiveStatus("PENDING_REVIEW", new Date("2026-01-01"), now)).toBe(
      "PENDING_REVIEW"
    );
    expect(computeEffectiveStatus("CANCELLED", new Date("2026-01-01"), now)).toBe("CANCELLED");
  });
});
