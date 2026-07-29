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

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN" } } as never;

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
