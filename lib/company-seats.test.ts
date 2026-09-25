import { describe, expect, it, vi } from "vitest";

import { countUsedSeats, seatCap } from "./company-seats";

describe("seatCap", () => {
  it("returns the plan's seat count plus purchased extra seats for a fixed bundle", () => {
    expect(
      seatCap({
        plan: { pricingMode: "FIXED_BUNDLE", maxTeamMembers: 2 },
        declaredParticipants: null,
        extraSeats: 3,
      })
    ).toBe(5);
  });

  it("returns the declared count plus extra seats for a group offer", () => {
    expect(
      seatCap({
        plan: { pricingMode: "PER_PARTICIPANT", maxTeamMembers: null },
        declaredParticipants: 12,
        extraSeats: 0,
      })
    ).toBe(12);
  });

  it("returns null when the plan has no seat count set", () => {
    expect(
      seatCap({
        plan: { pricingMode: "FIXED_BUNDLE", maxTeamMembers: null },
        declaredParticipants: null,
        extraSeats: 0,
      })
    ).toBeNull();
  });

  it("treats a missing pricing mode as a fixed bundle", () => {
    expect(
      seatCap({
        plan: { pricingMode: null, maxTeamMembers: 4 },
        declaredParticipants: null,
        extraSeats: 1,
      })
    ).toBe(5);
  });
});

describe("countUsedSeats", () => {
  const NOW = new Date("2026-09-25T12:00:00Z");

  function fakeDb(users: number, invites: number) {
    return {
      user: { count: vi.fn().mockResolvedValue(users) },
      companyInvite: { count: vi.fn().mockResolvedValue(invites) },
    };
  }

  it("adds seat-holding accounts and non-expired pending invites", async () => {
    const db = fakeDb(2, 1);
    const used = await countUsedSeats(
      { id: "company_1", companyAdminId: "admin_1", adminParticipates: true },
      { db: db as never, now: NOW }
    );

    expect(used).toBe(3);
    expect(db.user.count).toHaveBeenCalledWith({
      where: {
        companyId: "company_1",
        // Un compte suspendu garde sa place ; seuls CANCELLED/EXPIRED la libèrent.
        status: { in: ["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"] },
      },
    });
    expect(db.companyInvite.count).toHaveBeenCalledWith({
      where: { companyId: "company_1", status: "PENDING", expiresAt: { gt: NOW } },
    });
  });

  it("leaves the company admin out unless they ticked « Je participe »", async () => {
    const db = fakeDb(1, 0);
    await countUsedSeats(
      { id: "company_1", companyAdminId: "admin_1", adminParticipates: false },
      { db: db as never, now: NOW }
    );

    expect(db.user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { not: "admin_1" } }),
    });
  });

  it("can leave one invite out of the count (resend / accept)", async () => {
    const db = fakeDb(0, 0);
    await countUsedSeats(
      { id: "company_1", companyAdminId: "admin_1", adminParticipates: false },
      { db: db as never, now: NOW, excludeInviteId: "invite_1" }
    );

    expect(db.companyInvite.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { not: "invite_1" } }),
    });
  });
});
