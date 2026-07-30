import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    event: { create: vi.fn(), update: vi.fn() },
    eventRegistration: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminAccessError } from "@/lib/admin-auth";
import { createEvent, updateEvent, setEventStatus, checkInRegistration } from "./admin-events";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const VALID_INPUT = {
  title: "Dîner Privé — Finance",
  type: "DINER" as const,
  description: "Un dîner privé pour dirigeants du secteur financier.",
  programText: "19h30 — Accueil\n20h00 — Dîner",
  speakersText: "Sarah Razanamahery | DG | BNI Madagascar",
  location: "Hotel Carlton",
  isOnline: false,
  zoomMeetingId: "",
  date: "2026-10-14T19:30",
  capacity: 20,
  minTier: "EXECUTIVE" as const,
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
    it("creates a draft event with parsed program/speakers", async () => {
      vi.mocked(prisma.event.create).mockResolvedValue({ id: "evt_1" } as never);

      const result = await createEvent(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DRAFT",
            program: [{ day: "Programme", items: ["19h30 — Accueil", "20h00 — Dîner"] }],
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

  describe("checkInRegistration", () => {
    it("checks in a confirmed registration", async () => {
      vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
        id: "reg_1",
        eventId: "evt_1",
        status: "CONFIRMED",
        checkedIn: false,
        user: { name: "Jean-Pierre Rakoto" },
      } as never);

      const result = await checkInRegistration("evt_1", "qr_token_1");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: "Jean-Pierre Rakoto", alreadyCheckedIn: false });
      }
      expect(prisma.eventRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "reg_1" },
          data: expect.objectContaining({ checkedIn: true }),
        })
      );
    });

    it("reports already-checked-in without re-updating", async () => {
      vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
        id: "reg_1",
        eventId: "evt_1",
        status: "CONFIRMED",
        checkedIn: true,
        user: { name: "Jean-Pierre Rakoto" },
      } as never);

      const result = await checkInRegistration("evt_1", "qr_token_1");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.alreadyCheckedIn).toBe(true);
      expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
    });

    it("rejects a code that doesn't exist or belongs to another event", async () => {
      vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(null);
      const result = await checkInRegistration("evt_1", "bogus");
      expect(result.success).toBe(false);
    });

    it("rejects a registration that isn't confirmed yet", async () => {
      vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
        id: "reg_1",
        eventId: "evt_1",
        status: "PENDING_PAYMENT",
        checkedIn: false,
        user: { name: "Fatima Said" },
      } as never);

      const result = await checkInRegistration("evt_1", "qr_token_2");
      expect(result.success).toBe(false);
      expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
    });
  });
});
