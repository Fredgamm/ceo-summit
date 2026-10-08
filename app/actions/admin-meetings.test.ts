import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    eventMeetingSetup: { upsert: vi.fn(), update: vi.fn() },
    meetingTimeSlot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    meetingBooking: { count: vi.fn(), updateMany: vi.fn() },
    meetingParticipantSlot: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  addMeetingSlot,
  deleteMeetingSlot,
  generateMeetingSlots,
  publishMeetingSlots,
  saveMeetingSetup,
  setMeetingSlotDisabled,
} from "./admin-meetings";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

// 12–13 mars 2027 à La Réunion (UTC+4), dans le futur.
const EVENT = {
  id: "evt_1",
  date: new Date("2027-03-12T04:00:00Z"),
  endDate: new Date("2027-03-13T14:00:00Z"),
  timezone: "Indian/Reunion",
  isOnline: false,
  type: "SUMMIT",
  meetingSetup: { status: "DRAFT" },
};

const GRID = {
  days: ["2027-03-12"],
  dayStart: "09:00",
  dayEnd: "10:00",
  durationMinutes: 30,
  pauseStart: "",
  pauseEnd: "",
};

describe("admin meeting actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);
    vi.mocked(prisma.meetingTimeSlot.findMany).mockResolvedValue([]);
  });

  describe("saveMeetingSetup", () => {
    it("saves the zone and access instructions", async () => {
      const result = await saveMeetingSetup("evt_1", {
        zone: "Espace B2B",
        accessInstructions: "Niveau 1, à gauche de l'accueil.",
        slotDurationMinutes: 30,
      });

      expect(result.success).toBe(true);
      expect(prisma.eventMeetingSetup.upsert).toHaveBeenCalled();
    });

    it("refuses an event that is not a « Summit annuel »", async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...EVENT,
        type: "RENCONTRE",
      } as never);

      const result = await saveMeetingSetup("evt_1", {
        zone: "Espace B2B",
        accessInstructions: "Niveau 1, à gauche.",
        slotDurationMinutes: 30,
      });

      expect(result).toEqual({
        success: false,
        error: "Les créneaux rendez-vous sont réservés aux événements de type « Summit annuel ».",
      });
      expect(prisma.eventMeetingSetup.upsert).not.toHaveBeenCalled();
    });

    it("refuses an online event", async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({ ...EVENT, isOnline: true } as never);

      const result = await saveMeetingSetup("evt_1", {
        zone: "Espace B2B",
        accessInstructions: "Niveau 1, à gauche.",
        slotDurationMinutes: 30,
      });

      expect(result.success).toBe(false);
      expect(prisma.eventMeetingSetup.upsert).not.toHaveBeenCalled();
    });
  });

  describe("generateMeetingSlots", () => {
    it("replaces draft slots with the grid, in the event's timezone", async () => {
      const result = await generateMeetingSlots("evt_1", GRID);

      expect(result).toEqual({ success: true, data: { created: 2, skipped: 0 } });
      expect(prisma.meetingTimeSlot.deleteMany).toHaveBeenCalledWith({
        where: { eventId: "evt_1", status: "DRAFT" },
      });
      expect(prisma.meetingTimeSlot.createMany).toHaveBeenCalledWith({
        data: [
          {
            eventId: "evt_1",
            startTime: new Date("2027-03-12T05:00:00Z"),
            endTime: new Date("2027-03-12T05:30:00Z"),
            status: "DRAFT",
          },
          {
            eventId: "evt_1",
            startTime: new Date("2027-03-12T05:30:00Z"),
            endTime: new Date("2027-03-12T06:00:00Z"),
            status: "DRAFT",
          },
        ],
        skipDuplicates: true,
      });
    });

    it("after publication, only adds non-overlapping slots, already published", async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...EVENT,
        meetingSetup: { status: "PUBLISHED" },
      } as never);
      vi.mocked(prisma.meetingTimeSlot.findMany).mockResolvedValue([
        { startTime: new Date("2027-03-12T05:00:00Z"), endTime: new Date("2027-03-12T05:30:00Z") },
      ] as never);

      const result = await generateMeetingSlots("evt_1", GRID);

      expect(result).toEqual({ success: true, data: { created: 1, skipped: 1 } });
      expect(prisma.meetingTimeSlot.deleteMany).not.toHaveBeenCalled();
      const data = vi.mocked(prisma.meetingTimeSlot.createMany).mock.calls[0][0]!.data as {
        status: string;
      }[];
      expect(data).toHaveLength(1);
      expect(data[0].status).toBe("PUBLISHED");
    });

    it("refuses days outside the event", async () => {
      const result = await generateMeetingSlots("evt_1", { ...GRID, days: ["2027-03-20"] });

      expect(result.success).toBe(false);
      expect(prisma.meetingTimeSlot.createMany).not.toHaveBeenCalled();
    });

    it("requires the zone to be set first", async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...EVENT,
        meetingSetup: null,
      } as never);

      const result = await generateMeetingSlots("evt_1", GRID);

      expect(result.success).toBe(false);
    });

    it("is read-only once the event is over (RG-11)", async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...EVENT,
        date: new Date("2020-03-12T04:00:00Z"),
        endDate: new Date("2020-03-13T14:00:00Z"),
      } as never);

      const result = await generateMeetingSlots("evt_1", { ...GRID, days: ["2020-03-12"] });

      expect(result).toEqual({ success: false, error: "L'événement est terminé." });
    });
  });

  describe("addMeetingSlot", () => {
    it("adds a slot read in the event's timezone", async () => {
      vi.mocked(prisma.meetingTimeSlot.findFirst).mockResolvedValue(null);

      const result = await addMeetingSlot("evt_1", {
        day: "2027-03-13",
        start: "16:00",
        end: "16:30",
      });

      expect(result.success).toBe(true);
      expect(prisma.meetingTimeSlot.create).toHaveBeenCalledWith({
        data: {
          eventId: "evt_1",
          startTime: new Date("2027-03-13T12:00:00Z"),
          endTime: new Date("2027-03-13T12:30:00Z"),
          status: "DRAFT",
        },
      });
    });

    it("refuses an overlapping slot", async () => {
      vi.mocked(prisma.meetingTimeSlot.findFirst).mockResolvedValue({ id: "slot_x" } as never);

      const result = await addMeetingSlot("evt_1", {
        day: "2027-03-13",
        start: "16:00",
        end: "16:30",
      });

      expect(result.success).toBe(false);
      expect(prisma.meetingTimeSlot.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteMeetingSlot", () => {
    it("refuses to delete a slot that already received requests", async () => {
      vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
        eventId: "evt_1",
        _count: { bookings: 1 },
      } as never);

      const result = await deleteMeetingSlot("slot_1");

      expect(result.success).toBe(false);
      expect(prisma.meetingTimeSlot.delete).not.toHaveBeenCalled();
    });
  });

  describe("setMeetingSlotDisabled", () => {
    beforeEach(() => {
      vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
        eventId: "evt_1",
        status: "PUBLISHED",
        event: { meetingSetup: { status: "PUBLISHED" } },
      } as never);
    });

    it("asks for confirmation when requests or meetings exist (RG-12)", async () => {
      vi.mocked(prisma.meetingBooking.count).mockResolvedValue(2);

      const result = await setMeetingSlotDisabled("slot_1", true);

      expect(result).toMatchObject({ success: false, activeBookings: 2 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("cancels them and frees participants' availabilities once confirmed", async () => {
      vi.mocked(prisma.meetingBooking.count).mockResolvedValue(2);

      const result = await setMeetingSlotDisabled("slot_1", true, { confirmCancel: true });

      expect(result).toEqual({ success: true, data: { cancelled: 2 } });
      expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
        where: { slotId: "slot_1", status: { in: ["PENDING", "CONFIRMED"] } },
        data: { status: "CANCELLED", cancelReason: "Créneau désactivé par l'organisation." },
      });
      expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
        where: { slotId: "slot_1", status: { in: ["PENDING", "BOOKED"] } },
        data: { status: "FREE", bookingId: null },
      });
      expect(prisma.meetingTimeSlot.update).toHaveBeenCalledWith({
        where: { id: "slot_1" },
        data: { status: "DISABLED" },
      });
    });

    it("re-enables a disabled slot as published", async () => {
      vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
        eventId: "evt_1",
        status: "DISABLED",
        event: { meetingSetup: { status: "PUBLISHED" } },
      } as never);

      await setMeetingSlotDisabled("slot_1", false);

      expect(prisma.meetingTimeSlot.update).toHaveBeenCalledWith({
        where: { id: "slot_1" },
        data: { status: "PUBLISHED" },
      });
    });
  });

  describe("publishMeetingSlots", () => {
    it("publishes draft slots and the setup", async () => {
      vi.mocked(prisma.meetingTimeSlot.count).mockResolvedValue(4);

      const result = await publishMeetingSlots("evt_1");

      expect(result).toEqual({ success: true, data: { published: 4 } });
      expect(prisma.meetingTimeSlot.updateMany).toHaveBeenCalledWith({
        where: { eventId: "evt_1", status: "DRAFT" },
        data: { status: "PUBLISHED" },
      });
      expect(prisma.eventMeetingSetup.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHED" }) })
      );
    });

    it("refuses to publish an empty grid", async () => {
      vi.mocked(prisma.meetingTimeSlot.count).mockResolvedValue(0);

      const result = await publishMeetingSlots("evt_1");

      expect(result.success).toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
