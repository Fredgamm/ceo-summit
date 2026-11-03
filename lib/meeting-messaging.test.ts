import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { message: { create: vi.fn() }, conversation: { update: vi.fn() } },
}));
vi.mock("@/lib/conversations", () => ({ getOrCreateConversation: vi.fn() }));
vi.mock("@/lib/message-crypto", () => ({ encryptMessageContent: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getOrCreateConversation } from "@/lib/conversations";
import { encryptMessageContent } from "@/lib/message-crypto";
import { postMeetingResponseMessage } from "./meeting-messaging";

describe("postMeetingResponseMessage", () => {
  const CREATED_AT = new Date("2027-01-10T08:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateConversation).mockResolvedValue({ id: "conv_1" } as never);
    vi.mocked(encryptMessageContent).mockResolvedValue(Buffer.from("chiffré"));
    vi.mocked(prisma.message.create).mockResolvedValue({ createdAt: CREATED_AT } as never);
  });

  it("opens (or finds) the conversation between the two people", async () => {
    await postMeetingResponseMessage({
      fromUserId: "bob",
      toUserId: "alice",
      slotLabel: "11 janvier 2027, 09h30",
      text: "Avec plaisir !",
    });

    expect(getOrCreateConversation).toHaveBeenCalledWith("bob", "alice");
  });

  it("stores the message encrypted, from the person who answered, with the meeting in context", async () => {
    await postMeetingResponseMessage({
      fromUserId: "bob",
      toUserId: "alice",
      slotLabel: "11 janvier 2027, 09h30",
      text: "Retrouvons-nous à l'entrée.",
    });

    expect(encryptMessageContent).toHaveBeenCalledWith(
      "À propos de notre rendez-vous du 11 janvier 2027, 09h30 : Retrouvons-nous à l'entrée."
    );
    // Jamais en clair en base : seul le texte chiffré est enregistré.
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: "conv_1", senderId: "bob", content: Buffer.from("chiffré") },
      select: { createdAt: true },
    });
  });

  it("moves the conversation up in the list of both people", async () => {
    await postMeetingResponseMessage({
      fromUserId: "bob",
      toUserId: "alice",
      slotLabel: "x",
      text: "Bonjour",
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: { lastMessageAt: CREATED_AT },
    });
  });
});
