import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findUnique: vi.fn() },
    roomRead: { upsert: vi.fn() },
    roomMessage: { findUnique: vi.fn() },
    roomReport: { findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    emailTemplateOverride: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { markRoomAsRead, reportRoomMessage } from "./rooms";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    name: "Jean-Pierre",
    status: "ACTIVE",
    company: { subscription: { status: "ACTIVE", plan: { rank: 1 } } },
    ...overrides,
  } as never;
}

describe("markRoomAsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      status: "ACTIVE",
      minTier: "ALL_MEMBERS",
    } as never);
  });

  /**
   * Audit sécurité (25 septembre 2026) — ne vérifiait que la session, ni le
   * statut du compte ni l'accès à la salle.
   */
  it("rejects a viewer without room access (no active company offer)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer({ company: null }));
    const result = await markRoomAsRead("room_1");
    expect(result.success).toBe(false);
    expect(prisma.roomRead.upsert).not.toHaveBeenCalled();
  });

  it("rejects an archived or unknown room", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue(null);
    const result = await markRoomAsRead("room_x");
    expect(result.success).toBe(false);
    expect(prisma.roomRead.upsert).not.toHaveBeenCalled();
  });

  it("rejects a suspended member whose session is still open", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer({ status: "SUSPENDED" }));
    const result = await markRoomAsRead("room_1");
    expect(result.success).toBe(false);
    expect(prisma.roomRead.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await markRoomAsRead("room_1");
    expect(result.success).toBe(false);
    expect(prisma.roomRead.upsert).not.toHaveBeenCalled();
  });

  it("upserts the last-read timestamp for the viewer", async () => {
    const result = await markRoomAsRead("room_1");
    expect(result.success).toBe(true);
    expect(prisma.roomRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId_userId: { roomId: "room_1", userId: "user_1" } } })
    );
  });
});

describe("reportRoomMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.roomMessage.findUnique).mockResolvedValue({
      id: "msg_1",
      deletedAt: null,
      room: {
        id: "room_1",
        name: "Énergie & Environnement",
        status: "ACTIVE",
        minTier: "ALL_MEMBERS",
      },
    } as never);
    vi.mocked(prisma.roomReport.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    process.env.ADMIN_ALERT_EMAIL = "admin@ceo-summit.mg";
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(false);
    expect(prisma.roomReport.create).not.toHaveBeenCalled();
  });

  it("rejects reporting a deleted message", async () => {
    vi.mocked(prisma.roomMessage.findUnique).mockResolvedValue({
      id: "msg_1",
      deletedAt: new Date(),
      room: { id: "room_1", name: "Énergie" },
    } as never);
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(false);
  });

  it("rejects reporting a message from a room the viewer has no access to", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer({ company: null }));
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(false);
    expect(prisma.roomReport.create).not.toHaveBeenCalled();
  });

  it("rejects reporting a message from an archived room", async () => {
    vi.mocked(prisma.roomMessage.findUnique).mockResolvedValue({
      id: "msg_1",
      deletedAt: null,
      room: { id: "room_1", name: "Énergie", status: "ARCHIVED", minTier: "ALL_MEMBERS" },
    } as never);
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(false);
    expect(prisma.roomReport.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate report from the same member", async () => {
    vi.mocked(prisma.roomReport.findFirst).mockResolvedValue({ id: "report_1" } as never);
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(false);
    expect(prisma.roomReport.create).not.toHaveBeenCalled();
  });

  it("creates a pending report and alerts the admin", async () => {
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(true);
    expect(prisma.roomReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomMessageId: "msg_1",
          reportedById: "user_1",
          status: "PENDING",
        }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });
});
