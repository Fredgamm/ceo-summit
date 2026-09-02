import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    opportunity: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/opportunity-approved-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/opportunity-changes-requested-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/opportunity-refused-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  approveOpportunity,
  requestOpportunityChanges,
  rejectOpportunity,
  unpublishOpportunity,
  republishOpportunity,
  saveModerationNote,
} from "./admin-deal-room";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

function makeOpportunity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "opp_1",
    title: "Partenariat distribution solaire",
    status: "PENDING_MODERATION",
    author: { email: "membre@example.com" },
    ...overrides,
  } as never;
}

describe("approveOpportunity / requestOpportunityChanges / rejectOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
  });

  it("publishes the opportunity and emails the author", async () => {
    const result = await approveOpportunity("opp_1");
    expect(result.success).toBe(true);
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHED" }) })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "membre@example.com" })
    );
    // Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
    // "aucun test n'affirme sur les écritures d'audit log" de modération.
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: "admin_1",
          action: "opportunity.approve",
          targetType: "Opportunity",
          targetId: "opp_1",
        }),
      })
    );
  });

  it("rejects approving an opportunity that isn't pending", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ status: "PUBLISHED" })
    );
    const result = await approveOpportunity("opp_1");
    expect(result.success).toBe(false);
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("requests changes with a message, emailing the author", async () => {
    const result = await requestOpportunityChanges("opp_1", "Précisez le budget.");
    expect(result.success).toBe(true);
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CHANGES_REQUESTED" }) })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "opportunity.request_changes", targetId: "opp_1" }),
      })
    );
  });

  it("rejects an empty changes-requested message", async () => {
    const result = await requestOpportunityChanges("opp_1", "   ");
    expect(result.success).toBe(false);
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("refuses with a reason, emailing the author the motif", async () => {
    const result = await rejectOpportunity("opp_1", "Informations insuffisantes.");
    expect(result.success).toBe(true);
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUSED" }) })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "membre@example.com" })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "opportunity.reject", targetId: "opp_1" }),
      })
    );
  });

  it("rejects an empty refusal reason", async () => {
    const result = await rejectOpportunity("opp_1", "");
    expect(result.success).toBe(false);
  });
});

describe("unpublishOpportunity / republishOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("unpublishes an active opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ status: "PUBLISHED" })
    );
    const result = await unpublishOpportunity("opp_1");
    expect(result.success).toBe(true);
    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: "opp_1" },
      data: { status: "UNPUBLISHED" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "opportunity.unpublish", targetId: "opp_1" }),
      })
    );
  });

  it("rejects unpublishing a non-active opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ status: "PENDING_MODERATION" })
    );
    const result = await unpublishOpportunity("opp_1");
    expect(result.success).toBe(false);
  });

  it("republishes an unpublished opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ status: "UNPUBLISHED" })
    );
    const result = await republishOpportunity("opp_1");
    expect(result.success).toBe(true);
    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: "opp_1" },
      data: { status: "PUBLISHED" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "opportunity.republish", targetId: "opp_1" }),
      })
    );
  });
});

describe("saveModerationNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("saves a trimmed internal note", async () => {
    const result = await saveModerationNote("opp_1", "  Vérifié, tout est en ordre.  ");
    expect(result.success).toBe(true);
    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: "opp_1" },
      data: { moderationNote: "Vérifié, tout est en ordre." },
    });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("clears the note when given only whitespace", async () => {
    await saveModerationNote("opp_1", "   ");
    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: "opp_1" },
      data: { moderationNote: null },
    });
  });
});
