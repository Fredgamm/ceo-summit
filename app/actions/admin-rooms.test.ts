import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    room: { update: vi.fn() },
    roomMessage: { update: vi.fn() },
    roomSuspension: { create: vi.fn() },
    roomReport: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/member-room-warning-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { archiveRoom, restoreRoom, resolveRoomReport } from "./admin-rooms";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN" } } as never;

const REPORT_BASE = {
  id: "report_1",
  status: "PENDING",
  roomMessage: {
    id: "msg_1",
    roomId: "room_1",
    authorId: "user_1",
    room: { id: "room_1", name: "Énergie & Environnement" },
    author: { id: "user_1", email: "membre@example.com" },
  },
};

describe("archiveRoom / restoreRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  it("archives a room and logs the action", async () => {
    const result = await archiveRoom("room_1");
    expect(result.success).toBe(true);
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room_1" },
      data: { status: "ARCHIVED" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "room.archive" }) })
    );
  });

  it("restores an archived room", async () => {
    const result = await restoreRoom("room_1");
    expect(result.success).toBe(true);
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room_1" },
      data: { status: "ACTIVE" },
    });
  });
});

describe("resolveRoomReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.roomReport.findUnique).mockResolvedValue(REPORT_BASE as never);
  });

  it("rejects an already-resolved report", async () => {
    vi.mocked(prisma.roomReport.findUnique).mockResolvedValue({
      ...REPORT_BASE,
      status: "RESOLVED_DELETED",
    } as never);
    const result = await resolveRoomReport("report_1", "RESOLVED_DELETED");
    expect(result.success).toBe(false);
    expect(prisma.roomMessage.update).not.toHaveBeenCalled();
  });

  it("soft-deletes the message on RESOLVED_DELETED", async () => {
    const result = await resolveRoomReport("report_1", "RESOLVED_DELETED");
    expect(result.success).toBe(true);
    expect(prisma.roomMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg_1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it("emails the author on RESOLVED_WARNED", async () => {
    const result = await resolveRoomReport("report_1", "RESOLVED_WARNED");
    expect(result.success).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "membre@example.com" })
    );
  });

  it("creates a room suspension on RESOLVED_EXCLUDED, defaulting to 7 days", async () => {
    const result = await resolveRoomReport("report_1", "RESOLVED_EXCLUDED");
    expect(result.success).toBe(true);
    expect(prisma.roomSuspension.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: "room_1",
          userId: "user_1",
          createdById: "admin_1",
        }),
      })
    );
  });

  it("does nothing extra on DISMISSED besides marking the report", async () => {
    const result = await resolveRoomReport("report_1", "DISMISSED");
    expect(result.success).toBe(true);
    expect(prisma.roomMessage.update).not.toHaveBeenCalled();
    expect(prisma.roomSuspension.create).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(prisma.roomReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DISMISSED" }) })
    );
  });
});
