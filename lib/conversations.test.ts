import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getOrCreateConversation, countUnreadMessages } from "./conversations";

describe("getOrCreateConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects starting a conversation with yourself", async () => {
    await expect(getOrCreateConversation("user_1", "user_1")).rejects.toThrow();
  });

  it("normalizes member ordering regardless of call order", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.conversation.create).mockResolvedValue({ id: "conv_1" } as never);

    await getOrCreateConversation("user_b", "user_a");

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { member1Id_member2Id: { member1Id: "user_a", member2Id: "user_b" } },
    });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { member1Id: "user_a", member2Id: "user_b", opportunityId: undefined },
    });
  });

  it("returns the existing conversation without creating a new one", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      opportunityId: null,
    } as never);

    const result = await getOrCreateConversation("user_a", "user_b");

    expect(result).toEqual({ id: "conv_1", opportunityId: null });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("backfills opportunityId on an existing conversation that didn't have one", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      opportunityId: null,
    } as never);
    vi.mocked(prisma.conversation.update).mockResolvedValue({
      id: "conv_1",
      opportunityId: "opp_1",
    } as never);

    const result = await getOrCreateConversation("user_a", "user_b", "opp_1");

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: { opportunityId: "opp_1" },
    });
    expect(result.opportunityId).toBe("opp_1");
  });

  it("does not overwrite an existing opportunityId", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      opportunityId: "opp_existing",
    } as never);

    await getOrCreateConversation("user_a", "user_b", "opp_new");

    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
});

describe("countUnreadMessages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts unread messages sent to the viewer across every conversation", async () => {
    vi.mocked(prisma.message.count).mockResolvedValue(3);

    const result = await countUnreadMessages("user_a");

    expect(result).toBe(3);
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: {
        readAt: null,
        senderId: { not: "user_a" },
        conversation: { OR: [{ member1Id: "user_a" }, { member2Id: "user_a" }] },
      },
    });
  });
});
