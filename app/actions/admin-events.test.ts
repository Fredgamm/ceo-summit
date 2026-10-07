import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    event: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminAccessError } from "@/lib/admin-auth";
import { createEvent, updateEvent, setEventStatus } from "./admin-events";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const VALID_INPUT = {
  title: "Dîner Privé — Finance",
  type: "DINER" as const,
  description: "Un dîner privé pour dirigeants du secteur financier.",
  speakersText: "Sarah Razanamahery | DG | BNI Madagascar",
  location: "Hotel Carlton",
  isOnline: false,
  zoomMeetingId: "",
  date: "2026-10-14T19:30",
  capacity: 20,
  price: 300000,
  imageUrl: "",
};

describe("admin event actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  describe("createEvent", () => {
    it("creates a draft event with parsed speakers", async () => {
      vi.mocked(prisma.event.create).mockResolvedValue({ id: "evt_1" } as never);

      const result = await createEvent(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DRAFT",
            speakers: [{ name: "Sarah Razanamahery", title: "DG", company: "BNI Madagascar" }],
          }),
        })
      );
    });

    it("rejects an invalid input without creating anything", async () => {
      const result = await createEvent({ ...VALID_INPUT, title: "a" });
      expect(result.success).toBe(false);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it("throws when the caller isn't an admin", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
      await expect(createEvent(VALID_INPUT)).rejects.toBeInstanceOf(AdminAccessError);
    });
  });

  describe("updateEvent", () => {
    it("updates the event's fields", async () => {
      const result = await updateEvent("evt_1", VALID_INPUT);
      expect(result.success).toBe(true);
      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "evt_1" } })
      );
    });
  });

  describe("setEventStatus", () => {
    it("updates the event's status and logs it", async () => {
      const result = await setEventStatus("evt_1", "PUBLISHED");
      expect(result.success).toBe(true);
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: "evt_1" },
        data: { status: "PUBLISHED" },
      });
    });
  });
});
