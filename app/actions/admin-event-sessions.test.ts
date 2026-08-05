import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    eventSession: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createEventSession, updateEventSession, deleteEventSession } from "./admin-event-sessions";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const VALID_INPUT = {
  title: "Table ronde : Investissement & Capital",
  description: "",
  room: "Salle plénière",
  startTime: "2026-11-24T14:30",
  endTime: "2026-11-24T15:30",
  speakersText: "Sarah Razanamahery | DG | BNI Madagascar",
};

describe("admin event session actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  describe("createEventSession", () => {
    it("creates a session with parsed speakers, scoped to the given event", async () => {
      vi.mocked(prisma.eventSession.create).mockResolvedValue({ id: "sess_1" } as never);

      const result = await createEventSession("evt_1", VALID_INPUT);

      expect(result).toEqual({ success: true, data: { id: "sess_1" } });
      expect(prisma.eventSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: "evt_1",
            title: VALID_INPUT.title,
            room: VALID_INPUT.room,
            speakers: [{ name: "Sarah Razanamahery", title: "DG", company: "BNI Madagascar" }],
          }),
        })
      );
    });

    it("rejects an end time before the start time without creating anything", async () => {
      const result = await createEventSession("evt_1", {
        ...VALID_INPUT,
        startTime: "2026-11-24T15:30",
        endTime: "2026-11-24T14:30",
      });

      expect(result.success).toBe(false);
      expect(prisma.eventSession.create).not.toHaveBeenCalled();
    });
  });

  describe("updateEventSession", () => {
    it("updates a session's fields", async () => {
      vi.mocked(prisma.eventSession.update).mockResolvedValue({
        id: "sess_1",
        eventId: "evt_1",
      } as never);

      const result = await updateEventSession("sess_1", { ...VALID_INPUT, room: "Salle B" });

      expect(result.success).toBe(true);
      expect(prisma.eventSession.update).toHaveBeenCalledWith({
        where: { id: "sess_1" },
        data: expect.objectContaining({ room: "Salle B" }),
      });
    });

    it("rejects invalid input without updating anything", async () => {
      const result = await updateEventSession("sess_1", { ...VALID_INPUT, title: "Hi" });
      expect(result.success).toBe(false);
      expect(prisma.eventSession.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteEventSession", () => {
    it("deletes the session", async () => {
      vi.mocked(prisma.eventSession.delete).mockResolvedValue({
        id: "sess_1",
        eventId: "evt_1",
      } as never);

      const result = await deleteEventSession("sess_1");

      expect(result.success).toBe(true);
      expect(prisma.eventSession.delete).toHaveBeenCalledWith({ where: { id: "sess_1" } });
    });
  });
});
