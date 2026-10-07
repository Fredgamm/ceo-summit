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
vi.mock("@/lib/r2", () => ({
  getSignedDownloadUrl: vi.fn(),
  isKeyUnderPrefix: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { getSignedDownloadUrl, isKeyUnderPrefix } from "@/lib/r2";
import BroadcastEmail from "@/emails/broadcast-email";
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
    vi.mocked(prisma.user.count).mockResolvedValueOnce(147);

    const result = await getSegmentCounts();

    expect(result).toEqual({
      success: true,
      data: { ALL_ACTIVE: 147 },
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

  /** Rapport QA du 1er oct. 2026 (§3.2b) — ciblage par une ou plusieurs offres. */
  it("accepts several plan ids for the custom segment", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(5);
    const result = await getCustomSegmentCount(undefined, undefined, ["plan_a", "plan_b"]);
    expect(result).toEqual({ success: true, data: { count: 5 } });
  });
});

describe("sendTestBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(sendTransactionalEmail).mockResolvedValue({ id: "resend_1" } as never);
    vi.mocked(isKeyUnderPrefix).mockImplementation(
      (key, prefix) => typeof key === "string" && key.startsWith(prefix as string)
    );
    vi.mocked(getSignedDownloadUrl).mockImplementation(
      async (_bucket, key) => `https://signed/${key}`
    );
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

  /** Rapport QA du 1er oct. 2026 (§3.2a) — résolution des pièces jointes en liens signés. */
  it("resolves attachment keys into signed links before sending", async () => {
    const result = await sendTestBroadcast("Sujet", "Corps", [
      { key: "broadcasts/abc/plaquette.pdf", name: "plaquette.pdf" },
    ]);

    expect(result.success).toBe(true);
    expect(getSignedDownloadUrl).toHaveBeenCalledWith(
      expect.any(String),
      "broadcasts/abc/plaquette.pdf",
      expect.any(Number)
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("turns the relative local-storage path into an absolute link when R2 is not configured", async () => {
    vi.mocked(getSignedDownloadUrl).mockImplementation(
      async (bucket, key) => `/api/dev/local-storage/${bucket}/${key}`
    );
    vi.stubEnv("NEXTAUTH_URL", "https://app.ceo-summit.mg");

    await sendTestBroadcast("Sujet", "Corps", [
      { key: "broadcasts/abc-plaquette.pdf", name: "plaquette.pdf" },
    ]);

    const props = vi.mocked(BroadcastEmail).mock.calls[0][0] as {
      attachments: { url: string }[];
    };
    expect(props.attachments[0].url).toBe(
      "https://app.ceo-summit.mg/api/dev/local-storage/ceo-summit-documents/broadcasts/abc-plaquette.pdf"
    );
    vi.unstubAllEnvs();
  });

  it("drops an attachment key that is not under the broadcasts/ prefix", async () => {
    vi.mocked(isKeyUnderPrefix).mockReturnValue(false);

    await sendTestBroadcast("Sujet", "Corps", [
      { key: "other/abc/plaquette.pdf", name: "plaquette.pdf" },
    ]);

    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("sendBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(sendTransactionalEmail).mockResolvedValue({ id: "resend_1" } as never);
    vi.mocked(isKeyUnderPrefix).mockImplementation(
      (key, prefix) => typeof key === "string" && key.startsWith(prefix as string)
    );
    vi.mocked(getSignedDownloadUrl).mockImplementation(
      async (_bucket, key) => `https://signed/${key}`
    );
  });

  it("rejects an empty subject or body", async () => {
    const result = await sendBroadcast("", "Corps", "ALL_ACTIVE");
    expect(result.success).toBe(false);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("reports failed sends instead of counting them as delivered", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      makeUser({ id: "user_1", email: "jp@example.com" }),
      makeUser({ id: "user_2", email: "sarah@example.com" }),
    ] as never);
    vi.mocked(prisma.broadcast.create).mockResolvedValue({ id: "broadcast_1" } as never);
    vi.mocked(sendTransactionalEmail)
      .mockResolvedValueOnce({ id: "resend_1" } as never)
      .mockRejectedValueOnce(new Error("SMTP refused"));

    const result = await sendBroadcast("Sujet", "Corps", "ALL_ACTIVE");

    expect(result).toEqual({
      success: true,
      data: { id: "broadcast_1", recipientCount: 2, failedCount: 1 },
    });
  });

  it("rejects a segment with no matching recipients", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    const result = await sendBroadcast("Sujet", "Corps", "CUSTOM", "Comores");
    expect(result.success).toBe(false);
    expect(prisma.broadcast.create).not.toHaveBeenCalled();
  });

  it("rejects a retired tier segment", async () => {
    const result = await sendBroadcast("Sujet", "Corps", "CHAIRMAN" as never);
    expect(result.success).toBe(false);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("creates the broadcast, emails every recipient, and records recipients", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      makeUser({ id: "user_1", email: "jp@example.com" }),
      makeUser({ id: "user_2", email: "sarah@example.com", name: "Sarah Razanamahery" }),
    ] as never);
    vi.mocked(prisma.broadcast.create).mockResolvedValue({ id: "broadcast_1" } as never);

    const result = await sendBroadcast("Sujet", "Bonjour {{prénom}}", "ALL_ACTIVE");

    expect(result).toEqual({
      success: true,
      data: { id: "broadcast_1", recipientCount: 2, failedCount: 0 },
    });
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

  /** Rapport QA du 1er oct. 2026 (§3.2b) — trace les offres ciblées sur le broadcast créé. */
  it("records the targeted plan ids on a CUSTOM segment", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      makeUser({ id: "user_1", email: "jp@example.com" }),
    ] as never);
    vi.mocked(prisma.broadcast.create).mockResolvedValue({ id: "broadcast_1" } as never);

    await sendBroadcast("Sujet", "Corps", "CUSTOM", undefined, undefined, ["plan_a", "plan_b"]);

    expect(prisma.broadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ segmentPlanIds: ["plan_a", "plan_b"] }),
      })
    );
  });

  /** Rapport QA du 1er oct. 2026 (§3.2a) — clés valides persistées, lien signé une seule fois pour tous. */
  it("persists only the valid attachment keys and resolves signed links once for every recipient", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      makeUser({ id: "user_1", email: "jp@example.com" }),
      makeUser({ id: "user_2", email: "sarah@example.com" }),
    ] as never);
    vi.mocked(prisma.broadcast.create).mockResolvedValue({ id: "broadcast_1" } as never);
    vi.mocked(isKeyUnderPrefix).mockImplementation((key) => key === "broadcasts/abc/plaquette.pdf");

    await sendBroadcast("Sujet", "Corps", "ALL_ACTIVE", undefined, undefined, undefined, [
      { key: "broadcasts/abc/plaquette.pdf", name: "plaquette.pdf" },
      { key: "other/xyz/evil.pdf", name: "evil.pdf" },
    ]);

    expect(prisma.broadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attachmentKeys: ["broadcasts/abc/plaquette.pdf"] }),
      })
    );
    expect(getSignedDownloadUrl).toHaveBeenCalledTimes(1);
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
