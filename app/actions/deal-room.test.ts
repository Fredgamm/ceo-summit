import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opportunity: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    opportunityContact: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-opportunity-alert-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/opportunity-contact-request-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/lib/conversations", () => ({ getOrCreateConversation: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
  type: "Partenariat",
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
    visibility: "MEMBER",
    author: { email: "author@example.com" },
    ...overrides,
  } as never;
}

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    name: "Jean-Pierre Rakoto",
    status: "ACTIVE",
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
    process.env.ADMIN_ALERT_EMAIL = "admin@ceo-summit.mg";
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

  /**
   * Bug réel (7 août 2026) — avec un `RESEND_API_KEY` de type placeholder
   * (`re_xxxxxxxxxxxx`, valeur par défaut de `.env.example`), l'envoi réel
   * échoue côté Resend (clé invalide) et `sendTransactionalEmail` lève ;
   * cet envoi n'était pas protégé, donc l'exception remontait jusqu'au
   * Server Action et la publication répondait 500 alors que l'opportunité
   * était déjà créée en base (l'utilisateur croyait sa soumission perdue).
   */
  it("still creates the opportunity even if the admin alert email fails", async () => {
    process.env.ADMIN_ALERT_EMAIL = "admin@ceo-summit.mg";
    vi.mocked(prisma.opportunity.create).mockResolvedValue({
      id: "opp_1",
      title: VALID_PUBLISH_INPUT.title,
    } as never);
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("boom"));

    const result = await publishOpportunity(VALID_PUBLISH_INPUT);

    expect(result.success).toBe(true);
  });
});

/**
 * Décision d'architecture (sept. 2026, conception/09) — le système de
 * crédits Deal Room est retiré du chemin actif : prendre contact est
 * désormais gratuit et illimité pour tout membre dont l'entreprise a une
 * offre active/validée, quel que soit son tier.
 */
describe("contactOpportunityAuthor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.opportunityContact.create).mockResolvedValue({} as never);
  });

  it("creates the contact for free", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await contactOpportunityAuthor("opp_1");

    expect(result.success).toBe(true);
    expect(prisma.opportunityContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          opportunityId: "opp_1",
          initiatorId: "user_1",
          receiverId: "author_1",
          creditsSpent: 0,
        }),
      })
    );
  });

  it("still creates the contact even if the notification email fails", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("boom"));

    const result = await contactOpportunityAuthor("opp_1");

    expect(result.success).toBe(true);
    expect(prisma.opportunityContact.create).toHaveBeenCalled();
  });

  it("allows a viewer regardless of tier vs. the opportunity's visibility", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ visibility: "CHAIRMAN" })
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      makeViewer({ company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } } })
    );

    const result = await contactOpportunityAuthor("opp_1");

    expect(result.success).toBe(true);
    expect(prisma.opportunityContact.create).toHaveBeenCalled();
  });

  it("rejects a viewer with no active company access (null tier) regardless of visibility", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ visibility: "MEMBER" })
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer({ company: null }));

    const result = await contactOpportunityAuthor("opp_1");

    expect(result.success).toBe(false);
    expect(prisma.opportunityContact.create).not.toHaveBeenCalled();
  });

  it("rejects contacting your own opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ authorId: "user_1" })
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await contactOpportunityAuthor("opp_1");
    expect(result.success).toBe(false);
    expect(prisma.opportunityContact.create).not.toHaveBeenCalled();
  });

  it("rejects a second contact attempt on the same opportunity", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(makeOpportunity());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await contactOpportunityAuthor("opp_1");
    expect(result.success).toBe(false);
    expect(prisma.opportunityContact.create).not.toHaveBeenCalled();
  });

  it("rejects an opportunity that isn't published", async () => {
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue(
      makeOpportunity({ status: "PENDING_MODERATION" })
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());

    const result = await contactOpportunityAuthor("opp_1");
    expect(result.success).toBe(false);
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
    initiator: { email: "hery@example.mg", name: "Hery Andria" },
    ...overrides,
  } as never;
}

describe("acceptOpportunityContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
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
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hery@example.mg" })
    );
  });
});

describe("declineOpportunityContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.opportunityContact.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  it("rejects someone who isn't the receiver", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ receiverId: "someone_else" })
    );
    const result = await declineOpportunityContact("contact_1");
    expect(result.success).toBe(false);
    expect(prisma.opportunityContact.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an already-processed request", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ status: "DECLINED" })
    );
    const result = await declineOpportunityContact("contact_1");
    expect(result.success).toBe(false);
    expect(prisma.opportunityContact.updateMany).not.toHaveBeenCalled();
  });

  it("marks the contact declined", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(makeContact());
    const result = await declineOpportunityContact("contact_1");
    expect(result.success).toBe(true);
    expect(prisma.opportunityContact.updateMany).toHaveBeenCalledWith({
      where: { id: "contact_1", status: "PENDING" },
      data: { status: "DECLINED" },
    });
  });

  it("does not double-process when the status flip races (updateMany affects 0 rows)", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(makeContact());
    vi.mocked(prisma.opportunityContact.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const result = await declineOpportunityContact("contact_1");

    expect(result.success).toBe(false);
  });
});

describe("withdrawOpportunityContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.opportunityContact.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  it("rejects someone who isn't the initiator", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ initiatorId: "someone_else" })
    );
    const result = await withdrawOpportunityContact("contact_1");
    expect(result.success).toBe(false);
    expect(prisma.opportunityContact.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an already-processed request", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ initiatorId: "user_1", status: "ACCEPTED" })
    );
    const result = await withdrawOpportunityContact("contact_1");
    expect(result.success).toBe(false);
  });

  it("lets the initiator withdraw their own pending request", async () => {
    vi.mocked(prisma.opportunityContact.findUnique).mockResolvedValue(
      makeContact({ initiatorId: "user_1" })
    );
    const result = await withdrawOpportunityContact("contact_1");
    expect(result.success).toBe(true);
    expect(prisma.opportunityContact.updateMany).toHaveBeenCalledWith({
      where: { id: "contact_1", status: "PENDING" },
      data: { status: "DECLINED" },
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
      status: "ACTIVE",
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
