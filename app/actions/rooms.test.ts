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
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-room-report-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { markRoomAsRead, reportRoomMessage } from "./rooms";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;
const ALL_MEMBERS_VIEWER: Record<string, unknown> = {
  id: "user_1",
  name: "Jean-Pierre",
  status: "ACTIVE",
  company: { subscription: { status: "ACTIVE", plan: { rank: 0 } } },
};

describe("markRoomAsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      minTier: "ALL_MEMBERS",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ALL_MEMBERS_VIEWER as never);
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

  it("rejects an unknown room", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue(null);
    const result = await markRoomAsRead("room_x");
    expect(result.success).toBe(false);
    expect(prisma.roomRead.upsert).not.toHaveBeenCalled();
  });

  /**
   * Correctif (refactor dette technique, sept. 2026) — audit du 7 août :
   * cette action ne revérifiait jamais le tier, contrairement au reste des
   * chemins de salle.
   */
  it("rejects a viewer whose tier can't access the room", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room_1",
      minTier: "CHAIRMAN_ONLY",
    } as never);
    const result = await markRoomAsRead("room_1");
    expect(result.success).toBe(false);
    expect(prisma.roomRead.upsert).not.toHaveBeenCalled();
  });

  /**
   * Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
   * "session non révoquée après sanction" : migré vers `requireViewer()`,
   * qui relit `User.status` en base au lieu d'un `auth()` brut.
   */
  it("rejects a suspended/excluded member even with a valid session", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...ALL_MEMBERS_VIEWER,
      status: "SUSPENDED",
    } as never);
    const result = await markRoomAsRead("room_1");
    expect(result.success).toBe(false);
    expect(prisma.roomRead.upsert).not.toHaveBeenCalled();
  });
});

describe("reportRoomMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.roomMessage.findUnique).mockResolvedValue({
      id: "msg_1",
      deletedAt: null,
      room: { id: "room_1", name: "Énergie & Environnement", minTier: "ALL_MEMBERS" },
    } as never);
    vi.mocked(prisma.roomReport.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ALL_MEMBERS_VIEWER as never);
    process.env.ADMIN_ALERT_EMAIL = "admin@ceosummit.mg";
  });

  /**
   * Correctif (refactor dette technique, sept. 2026) — audit du 7 août :
   * même gap que markRoomAsRead, cette fois sur un id de message.
   */
  it("rejects a viewer whose tier can't access the room", async () => {
    vi.mocked(prisma.roomMessage.findUnique).mockResolvedValue({
      id: "msg_1",
      deletedAt: null,
      room: { id: "room_1", name: "Énergie", minTier: "CHAIRMAN_ONLY" },
    } as never);
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(false);
    expect(prisma.roomReport.create).not.toHaveBeenCalled();
  });

  it("rejects a suspended/excluded member even with a valid session", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...ALL_MEMBERS_VIEWER,
      status: "SUSPENDED",
    } as never);
    const result = await reportRoomMessage("msg_1");
    expect(result.success).toBe(false);
    expect(prisma.roomReport.create).not.toHaveBeenCalled();
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
