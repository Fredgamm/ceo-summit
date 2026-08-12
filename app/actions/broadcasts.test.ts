import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    user: { count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    broadcast: { create: vi.fn() },
    broadcastRecipient: { createMany: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/emails/broadcast-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  getSegmentCounts,
  getCustomSegmentCount,
  sendTestBroadcast,
  sendBroadcast,
} from "./broadcasts";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    name: "Jean-Pierre Rakoto",
    email: "jp@example.com",
    status: "ACTIVE",
    company: { name: "TechOcean" },
    memberships: [{ tier: "EXECUTIVE" }],
    ...overrides,
  } as never;
}

describe("getSegmentCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("returns real counts per segment", async () => {
    vi.mocked(prisma.user.count)
      .mockResolvedValueOnce(147)
      .mockResolvedValueOnce(38)
      .mockResolvedValueOnce(72);

    const result = await getSegmentCounts();

    expect(result).toEqual({
      success: true,
      data: { ALL_ACTIVE: 147, CHAIRMAN: 38, EXECUTIVE: 72 },
    });
  });
});

describe("getCustomSegmentCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("returns the count for a custom segment", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(12);
    const result = await getCustomSegmentCount("Madagascar", "Énergie & Environnement");
    expect(result).toEqual({ success: true, data: { count: 12 } });
  });
});

describe("sendTestBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(sendTransactionalEmail).mockResolvedValue({ id: "resend_1" } as never);
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await sendTestBroadcast("Sujet", "Corps");
    expect(result.success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty subject or body", async () => {
    const result = await sendTestBroadcast("", "Corps");
    expect(result.success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends only to the connected admin, with [TEST] prefix", async () => {
    const result = await sendTestBroadcast("Sujet", "Bonjour {{prénom}}");
    expect(result.success).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jp@example.com", subject: "[TEST] Sujet" })
    );
  });
});

describe("sendBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(sendTransactionalEmail).mockResolvedValue({ id: "resend_1" } as never);
  });

  it("rejects an empty subject or body", async () => {
    const result = await sendBroadcast("", "Corps", "ALL_ACTIVE");
    expect(result.success).toBe(false);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("rejects a segment with no matching recipients", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    const result = await sendBroadcast("Sujet", "Corps", "CHAIRMAN");
    expect(result.success).toBe(false);
    expect(prisma.broadcast.create).not.toHaveBeenCalled();
  });

  it("creates the broadcast, emails every recipient, and records recipients", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      makeUser({ id: "user_1", email: "jp@example.com" }),
      makeUser({ id: "user_2", email: "sarah@example.com", name: "Sarah Razanamahery" }),
    ] as never);
    vi.mocked(prisma.broadcast.create).mockResolvedValue({ id: "broadcast_1" } as never);

    const result = await sendBroadcast("Sujet", "Bonjour {{prénom}}", "ALL_ACTIVE");

    expect(result).toEqual({ success: true, data: { id: "broadcast_1", recipientCount: 2 } });
    expect(prisma.broadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientCount: 2, segment: "ALL_ACTIVE" }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(2);
    expect(prisma.broadcastRecipient.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          broadcastId: "broadcast_1",
          userId: "user_1",
          resendMessageId: "resend_1",
        }),
        expect.objectContaining({
          broadcastId: "broadcast_1",
          userId: "user_2",
          resendMessageId: "resend_1",
        }),
      ]),
    });
  });

  it("keeps going and records a null resendMessageId if one recipient's send fails", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      makeUser({ id: "user_1", email: "jp@example.com" }),
    ] as never);
    vi.mocked(prisma.broadcast.create).mockResolvedValue({ id: "broadcast_1" } as never);
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("boom"));

    const result = await sendBroadcast("Sujet", "Corps", "ALL_ACTIVE");

    expect(result.success).toBe(true);
    expect(prisma.broadcastRecipient.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: "user_1", resendMessageId: null })],
    });
  });
});
