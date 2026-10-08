import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/meeting-participation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meeting-participation")>();
  return { ...actual, meetingEventIdFor: vi.fn() };
});
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

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { meetingEventIdFor } from "@/lib/meeting-participation";
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
};

describe("member meeting slot actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireViewer).mockResolvedValue({ success: true, viewer: VIEWER } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);
    vi.mocked(meetingEventIdFor).mockResolvedValue("evt_1");
    vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
      eventId: "evt_1",
      status: "PUBLISHED",
      startTime: FUTURE,
    } as never);
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 3 }, { count: 2 }] as never);
  });

  describe("toggleMeetingSlot", () => {
    it("deactivates a slot that was active by default (no row yet)", async () => {
      vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.meetingParticipantSlot.findUnique).mockResolvedValue(null);

      const result = await toggleMeetingSlot("slot_1", false);

      expect(result.success).toBe(true);
      expect(prisma.meetingParticipantSlot.create).toHaveBeenCalledWith({
        data: { slotId: "slot_1", userId: "user_1", status: "INACTIVE" },
      });
    });

    it("does not overwrite a request created at the same moment (unique constraint)", async () => {
      vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.meetingParticipantSlot.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.meetingParticipantSlot.create).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" })
      );

      const result = await toggleMeetingSlot("slot_1", false);

      expect(result.success).toBe(false);
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

    it("refuses a member who is not a participant through an active offer of this event", async () => {
      vi.mocked(meetingEventIdFor).mockResolvedValue(null);

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
    it("re-activates every inactive upcoming slot", async () => {
      vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 4 });

      const result = await setAllMeetingSlots("evt_1", true);

      expect(result).toEqual({ success: true, data: { changed: 4 } });
      expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user_1", status: "INACTIVE" }),
          data: { status: "FREE" },
        })
      );
    });

    it("deactivates every free upcoming slot, including those active by default", async () => {
      vi.mocked(prisma.meetingTimeSlot.findMany).mockResolvedValue([
        { id: "slot_1" },
        { id: "slot_2" },
      ] as never);

      const result = await setAllMeetingSlots("evt_1", false);

      expect(result).toEqual({ success: true, data: { changed: 5 } });
      expect(prisma.meetingParticipantSlot.createMany).toHaveBeenCalledWith({
        data: [
          { slotId: "slot_1", userId: "user_1", status: "INACTIVE" },
          { slotId: "slot_2", userId: "user_1", status: "INACTIVE" },
        ],
        skipDuplicates: true,
      });
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
