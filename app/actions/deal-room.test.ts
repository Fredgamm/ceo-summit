import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opportunity: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    opportunityContact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    creditBalance: { findUnique: vi.fn(), update: vi.fn() },
    creditTransaction: { create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
  },
}));

const mockTx = {
  creditBalance: { findUnique: vi.fn(), update: vi.fn() },
  creditTransaction: { create: vi.fn() },
  opportunityContact: { create: vi.fn(), update: vi.fn() },
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
vi.mock("@/emails/opportunity-contact-request-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/lib/conversations", () => ({ getOrCreateConversation: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withCreditDeductionLock, CreditDeductionLockBusyError } from "@/lib/credit-deduction-lock";
import { getOrCreateConversation } from "@/lib/conversations";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  publishOpportunity,
  contactOpportunityAuthor,
  acceptOpportunityContact,
  declineOpportunityContact,
  withdrawOpportunityContact,
  resubmitOpportunity,
} from "./deal-room";

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
    author: { email: "author@example.com" },
    ...overrides,
  } as never;
}

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    name: "Jean-Pierre Rakoto",
    company: { subscription: { status: "ACTIVE", plan: { rank: 2 } } },
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
      makeViewer({ company: { subscription: { status: "ACTIVE", plan: { rank: 3 } } } })
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

function makeContact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "contact_1",
    opportunityId: "opp_1",
    initiatorId: "user_2",
    receiverId: "user_1",
    status: "PENDING",
    creditsSpent: 1,
    opportunity: { title: "Recherche partenaire" },
    ...overrides,
  } as never;
}

describe("acceptOpportunityContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await acceptOpportunityContact("contact_1");
    expect(result.success).toBe(false);
  });

  it("rejects someone who isn't the receiver", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ receiverId: "someone_else" })
    );
    const result = await acceptOpportunityContact("contact_1");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("rejects an already-processed request", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ status: "ACCEPTED" })
    );
    const result = await acceptOpportunityContact("contact_1");
    expect(result.success).toBe(false);
  });

  it("creates the conversation and marks the contact accepted", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(makeContact());
    vi.mocked(getOrCreateConversation).mockResolvedValue({ id: "conv_1" } as never);

    const result = await acceptOpportunityContact("contact_1");

    expect(result).toEqual({ success: true, data: { conversationId: "conv_1" } });
    expect(getOrCreateConversation).toHaveBeenCalledWith("user_2", "user_1", "opp_1");
    expect(prisma.opportunityContact.update).toHaveBeenCalledWith({
      where: { id: "contact_1" },
      data: { status: "ACCEPTED", conversationId: "conv_1" },
    });
  });
});

describe("declineOpportunityContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
  });

  it("rejects someone who isn't the receiver", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ receiverId: "someone_else" })
    );
    const result = await declineOpportunityContact("contact_1");
    expect(result.success).toBe(false);
    expect(mockTx.opportunityContact.update).not.toHaveBeenCalled();
  });

  it("rejects an already-processed request", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ status: "DECLINED" })
    );
    const result = await declineOpportunityContact("contact_1");
    expect(result.success).toBe(false);
    expect(mockTx.opportunityContact.update).not.toHaveBeenCalled();
  });

  it("marks the contact declined and refunds the credit the initiator spent", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(makeContact());
    const result = await declineOpportunityContact("contact_1");
    expect(result.success).toBe(true);
    expect(mockTx.opportunityContact.update).toHaveBeenCalledWith({
      where: { id: "contact_1" },
      data: { status: "DECLINED" },
    });
    expect(mockTx.creditBalance.update).toHaveBeenCalledWith({
      where: { userId: "user_2" },
      data: { used: { decrement: 1 } },
    });
    expect(mockTx.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user_2", amount: 1, type: "REFUND" }),
      })
    );
  });

  it("does not touch credits for a Chairman contact (creditsSpent: 0)", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ creditsSpent: 0 })
    );
    const result = await declineOpportunityContact("contact_1");
    expect(result.success).toBe(true);
    expect(mockTx.creditBalance.update).not.toHaveBeenCalled();
    expect(mockTx.creditTransaction.create).not.toHaveBeenCalled();
  });
});

describe("withdrawOpportunityContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
  });

  it("rejects someone who isn't the initiator", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ initiatorId: "someone_else" })
    );
    const result = await withdrawOpportunityContact("contact_1");
    expect(result.success).toBe(false);
    expect(mockTx.opportunityContact.update).not.toHaveBeenCalled();
  });

  it("rejects an already-processed request", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ initiatorId: "user_1", status: "ACCEPTED" })
    );
    const result = await withdrawOpportunityContact("contact_1");
    expect(result.success).toBe(false);
  });

  it("lets the initiator withdraw their own pending request and refunds the credit", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ initiatorId: "user_1" })
    );
    const result = await withdrawOpportunityContact("contact_1");
    expect(result.success).toBe(true);
    expect(mockTx.opportunityContact.update).toHaveBeenCalledWith({
      where: { id: "contact_1" },
      data: { status: "DECLINED" },
    });
    expect(mockTx.creditBalance.update).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { used: { decrement: 1 } },
    });
  });
});

describe("resubmitOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre Rakoto",
    } as never);
  });

  it("rejects someone who isn't the author", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ authorId: "someone_else", status: "REFUSED" })
    );
    const result = await resubmitOpportunity("opp_1", VALID_PUBLISH_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("rejects an opportunity that isn't REFUSED or CHANGES_REQUESTED", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ authorId: "user_1", status: "PUBLISHED" })
    );
    const result = await resubmitOpportunity("opp_1", VALID_PUBLISH_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("resets a REFUSED opportunity back to PENDING_MODERATION with cleared moderation fields", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ authorId: "user_1", status: "REFUSED" })
    );
    const result = await resubmitOpportunity("opp_1", VALID_PUBLISH_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: "opp_1" },
      data: expect.objectContaining({
        status: "PENDING_MODERATION",
        moderationNote: null,
        moderatedById: null,
        moderatedAt: null,
      }),
    });
  });

  it("also accepts a CHANGES_REQUESTED opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ authorId: "user_1", status: "CHANGES_REQUESTED" })
    );
    const result = await resubmitOpportunity("opp_1", VALID_PUBLISH_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects invalid input", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ authorId: "user_1", status: "REFUSED" })
    );
    const result = await resubmitOpportunity("opp_1", { ...VALID_PUBLISH_INPUT, title: "short" });
    expect(result.success).toBe(false);
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });
});
