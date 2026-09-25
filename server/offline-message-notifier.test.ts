import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    emailTemplateOverride: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("../lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));

import { prisma } from "../lib/prisma";
import { sendTransactionalEmail } from "../lib/resend";
import { sendOfflineEmailIfNeeded } from "./offline-message-notifier";

const PARAMS = {
  conversationId: "conv_1",
  recipientId: "user_2",
  senderId: "user_1",
  preview: "Bonjour, ceci est un test",
};

describe("sendOfflineEmailIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      lastEmailNotifiedAt: null,
    } as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        id: "user_2",
        email: "recipient@example.com",
        name: "Sarah",
      } as never)
      .mockResolvedValueOnce({
        id: "user_1",
        email: "sender@example.com",
        name: "Jean-Pierre",
      } as never);
  });

  it("does nothing if the recipient reconnected in the meantime", async () => {
    const connected = new Map([["user_2", new Set(["socket_1"])]]);
    await sendOfflineEmailIfNeeded(connected, PARAMS);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does nothing if the conversation no longer exists", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);
    await sendOfflineEmailIfNeeded(new Map(), PARAMS);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("skips within the 1h anti-spam window", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      lastEmailNotifiedAt: new Date(Date.now() - 10 * 60 * 1000),
    } as never);
    await sendOfflineEmailIfNeeded(new Map(), PARAMS);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends the email and stamps lastEmailNotifiedAt when the recipient is offline", async () => {
    await sendOfflineEmailIfNeeded(new Map(), PARAMS);

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "recipient@example.com" })
    );
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: { lastEmailNotifiedAt: expect.any(Date) },
    });
  });

  it("sends again once the anti-spam window has passed", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: "conv_1",
      lastEmailNotifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    } as never);
    await sendOfflineEmailIfNeeded(new Map(), PARAMS);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });
});
