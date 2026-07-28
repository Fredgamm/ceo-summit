import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opportunity: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    opportunityContact: { findUnique: vi.fn(), create: vi.fn() },
    creditBalance: { findUnique: vi.fn(), update: vi.fn() },
    creditTransaction: { create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
  },
}));

const mockTx = {
  creditBalance: { findUnique: vi.fn(), update: vi.fn() },
  creditTransaction: { create: vi.fn() },
  opportunityContact: { create: vi.fn() },
};

vi.mock("@/lib/credit-deduction-lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credit-deduction-lock")>();
  return {
    ...actual,
    withCreditDeductionLock: vi.fn((_userId: string, fn: () => Promise<unknown>) => fn()),
  };
});

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-opportunity-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withCreditDeductionLock, CreditDeductionLockBusyError } from "@/lib/credit-deduction-lock";
import { sendTransactionalEmail } from "@/lib/resend";
import { publishOpportunity, contactOpportunityAuthor } from "./deal-room";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

const VALID_PUBLISH_INPUT = {
  type: "PARTENARIAT" as const,
  sector: "Logistique & Transport",
  country: "Madagascar",
  title: "Recherche partenaire logistique — Nord Madagascar",
  description: "Notre groupe cherche un partenaire logistique pour couvrir la région Nord.",
  budget: "120000000",
  deadline: "2026-09-15",
  visibility: "MEMBER" as const,
  attachments: [] as string[],
};

function makeOpportunity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "opp_1",
    title: "Recherche partenaire",
    authorId: "author_1",
    status: "PUBLISHED",
    ...overrides,
  } as never;
}

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    name: "Jean-Pierre Rakoto",
    memberships: [{ tier: "EXECUTIVE" }],
    ...overrides,
  } as never;
}

describe("publishOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
  });

  it("creates a PENDING_MODERATION opportunity and alerts the admin", async () => {
    process.env.ADMIN_ALERT_EMAIL = "admin@ceosummit.mg";
    vi.mocked(prisma.opportunity.create).mockResolvedValue({
      id: "opp_1",
      title: VALID_PUBLISH_INPUT.title,
    } as never);

    const result = await publishOpportunity(VALID_PUBLISH_INPUT);

    expect(result.success).toBe(true);
    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING_MODERATION", budget: 120000000 }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input without creating anything", async () => {
    const result = await publishOpportunity({ ...VALID_PUBLISH_INPUT, title: "short" });
    expect(result.success).toBe(false);
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it("parses an empty budget/deadline as null", async () => {
    vi.mocked(prisma.opportunity.create).mockResolvedValue({ id: "opp_1", title: "x" } as never);
    await publishOpportunity({ ...VALID_PUBLISH_INPUT, budget: "", deadline: "" });
    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ budget: null, deadline: null }) })
    );
  });
});

describe("contactOpportunityAuthor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(null);
    mockTx.creditBalance.findUnique.mockResolvedValue({ included: 10, purchased: 0, used: 2 });
    mockTx.creditBalance.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.opportunityContact.create.mockResolvedValue({});
  });

  it("deducts 1 credit and creates the contact for a non-Chairman member", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await contactOpportunityAuthor("opp_1");

    expect(result.success).toBe(true);
    expect(mockTx.creditBalance.update).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { used: { increment: 1 } },
    });
    expect(mockTx.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -1, type: "DEDUCTION" }) })
    );
    expect(mockTx.opportunityContact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsSpent: 1 }) })
    );
  });

  it("bypasses the balance check and spends 0 credits for a Chairman", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      makeViewer({ memberships: [{ tier: "CHAIRMAN" }] })
    );

    const result = await contactOpportunityAuthor("opp_1");

    expect(result.success).toBe(true);
    expect(mockTx.creditBalance.findUnique).not.toHaveBeenCalled();
    expect(mockTx.creditBalance.update).not.toHaveBeenCalled();
    expect(mockTx.opportunityContact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsSpent: 0 }) })
    );
  });

  it("returns INSUFFICIENT_CREDITS when the balance is exhausted", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    mockTx.creditBalance.findUnique.mockResolvedValue({ included: 10, purchased: 0, used: 10 });

    const result = await contactOpportunityAuthor("opp_1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("INSUFFICIENT_CREDITS");
    expect(mockTx.opportunityContact.create).not.toHaveBeenCalled();
  });

  it("rejects contacting your own opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ authorId: "user_1" })
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await contactOpportunityAuthor("opp_1");
    expect(result.success).toBe(false);
    expect(mockTx.opportunityContact.create).not.toHaveBeenCalled();
  });

  it("rejects a second contact attempt on the same opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await contactOpportunityAuthor("opp_1");
    expect(result.success).toBe(false);
    expect(mockTx.opportunityContact.create).not.toHaveBeenCalled();
  });

  it("rejects an opportunity that isn't published", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ status: "PENDING_MODERATION" })
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await contactOpportunityAuthor("opp_1");
    expect(result.success).toBe(false);
  });

  it("surfaces a friendly error when the credit lock is busy", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(withCreditDeductionLock).mockRejectedValueOnce(new CreditDeductionLockBusyError());

    const result = await contactOpportunityAuthor("opp_1");
    expect(result.success).toBe(false);
    expect(mockTx.opportunityContact.create).not.toHaveBeenCalled();
  });
});
