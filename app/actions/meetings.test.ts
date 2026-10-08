import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    meetingTimeSlot: { findUnique: vi.fn(), findMany: vi.fn() },
    meetingParticipantSlot: {
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { setAllMeetingSlots, toggleMeetingSlot } from "./meetings";

const VIEWER = {
  id: "user_1",
  name: "Marie Dupont",
  email: "marie@example.mg",
  phone: "+261 34 00 000 00",
  companyId: "company_1",
};

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const EVENT = {
  date: FUTURE,
  endDate: new Date(FUTURE.getTime() + 24 * 3600 * 1000),
  meetingSetup: { status: "PUBLISHED" },
  registrations: [{ id: "reg_1" }],
};

describe("member meeting slot actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireViewer).mockResolvedValue({ success: true, viewer: VIEWER } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);
    vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
      eventId: "evt_1",
      status: "PUBLISHED",
      startTime: FUTURE,
    } as never);
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 3 }, { count: 2 }] as never);
  });

  describe("toggleMeetingSlot", () => {
    it("activates a slot for the first time (opt-in)", async () => {
      vi.mocked(prisma.meetingParticipantSlot.findUnique).mockResolvedValue(null);

      const result = await toggleMeetingSlot("slot_1", true);

      expect(result.success).toBe(true);
      expect(prisma.meetingParticipantSlot.create).toHaveBeenCalledWith({
        data: { slotId: "slot_1", userId: "user_1", status: "FREE" },
      });
    });

    it("re-activates an inactive slot", async () => {
      vi.mocked(prisma.meetingParticipantSlot.findUnique).mockResolvedValue({
        status: "INACTIVE",
      } as never);

      await toggleMeetingSlot("slot_1", true);

      expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
        where: { slotId: "slot_1", userId: "user_1", status: "INACTIVE" },
        data: { status: "FREE" },
      });
    });

    it("requires the minimum profile to activate (RG-02)", async () => {
      vi.mocked(requireViewer).mockResolvedValue({
        success: true,
        viewer: { ...VIEWER, phone: null, companyId: null },
      } as never);

      const result = await toggleMeetingSlot("slot_1", true);

      expect(result).toEqual({
        success: false,
        error: "Complétez votre profil avant d'activer des créneaux (entreprise, téléphone).",
      });
      expect(prisma.meetingParticipantSlot.create).not.toHaveBeenCalled();
    });

    it("refuses a member who is not a confirmed participant", async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...EVENT,
        registrations: [],
      } as never);

      const result = await toggleMeetingSlot("slot_1", true);

      expect(result.success).toBe(false);
      expect(prisma.meetingParticipantSlot.create).not.toHaveBeenCalled();
    });

    it("refuses a slot that already started", async () => {
      vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
        eventId: "evt_1",
        status: "PUBLISHED",
        startTime: new Date(Date.now() - 60_000),
      } as never);

      const result = await toggleMeetingSlot("slot_1", true);

      expect(result).toEqual({ success: false, error: "Ce créneau a déjà commencé." });
    });

    it("refuses a slot disabled by the admin", async () => {
      vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
        eventId: "evt_1",
        status: "DISABLED",
        startTime: FUTURE,
      } as never);

      expect((await toggleMeetingSlot("slot_1", true)).success).toBe(false);
    });

    it("deactivates only a free slot", async () => {
      const result = await toggleMeetingSlot("slot_1", false);

      expect(result.success).toBe(true);
      expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
        where: { slotId: "slot_1", userId: "user_1", status: "FREE" },
        data: { status: "INACTIVE" },
      });
    });

    it("never cancels a pending request by deactivating (RG-13)", async () => {
      vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.meetingParticipantSlot.findUnique).mockResolvedValue({
        status: "PENDING",
      } as never);

      const result = await toggleMeetingSlot("slot_1", false);

      expect(result.success).toBe(false);
    });
  });

  describe("setAllMeetingSlots", () => {
    it("activates every upcoming published slot", async () => {
      vi.mocked(prisma.meetingTimeSlot.findMany).mockResolvedValue([
        { id: "slot_1" },
        { id: "slot_2" },
      ] as never);

      const result = await setAllMeetingSlots("evt_1", true);

      expect(result).toEqual({ success: true, data: { changed: 5 } });
      expect(prisma.meetingParticipantSlot.createMany).toHaveBeenCalledWith({
        data: [
          { slotId: "slot_1", userId: "user_1", status: "FREE" },
          { slotId: "slot_2", userId: "user_1", status: "FREE" },
        ],
        skipDuplicates: true,
      });
    });

    it("deactivates only free upcoming slots", async () => {
      vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 4 });

      const result = await setAllMeetingSlots("evt_1", false);

      expect(result).toEqual({ success: true, data: { changed: 4 } });
      expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user_1", status: "FREE" }),
          data: { status: "INACTIVE" },
        })
      );
    });

    it("is closed once the event is over (RG-11)", async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        ...EVENT,
        date: new Date("2020-01-01"),
        endDate: new Date("2020-01-02"),
      } as never);

      const result = await setAllMeetingSlots("evt_1", true);

      expect(result).toEqual({ success: false, error: "L'événement est terminé." });
    });
  });
});
