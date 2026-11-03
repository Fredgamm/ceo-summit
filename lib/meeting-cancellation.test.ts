import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meeting-emails", () => ({
  sendMeetingCancelledEmails: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    meetingBooking: { findMany: vi.fn(), updateMany: vi.fn() },
    meetingParticipantSlot: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { sendMeetingCancelledEmails } from "@/lib/meeting-emails";
import { cancelMeetingsOfRemovedParticipants } from "./meeting-cancellation";

describe("cancelMeetingsOfRemovedParticipants (RG-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });

  it("does nothing, and queries nothing, when nobody was removed", async () => {
    expect(await cancelMeetingsOfRemovedParticipants("evt_1", [])).toBe(0);
    expect(prisma.meetingBooking.findMany).not.toHaveBeenCalled();
  });

  it("cancels the requests and meetings of the removed members, frees the slots and tells everyone", async () => {
    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValue([
      { id: "b1", status: "PENDING" },
      { id: "b2", status: "CONFIRMED" },
    ] as never);

    const cancelled = await cancelMeetingsOfRemovedParticipants("evt_1", ["u3", "u4"]);

    expect(cancelled).toBe(2);
    expect(prisma.meetingBooking.findMany).toHaveBeenCalledWith({
      where: {
        eventId: "evt_1",
        status: { in: ["PENDING", "CONFIRMED"] },
        OR: [{ requesterId: { in: ["u3", "u4"] } }, { recipientId: { in: ["u3", "u4"] } }],
      },
      select: { id: true, status: true },
    });
    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["b1", "b2"] }, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED", cancelReason: expect.stringContaining("retiré") },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingId: { in: ["b1", "b2"] } },
      data: { status: "FREE", bookingId: null },
    });
    expect(sendMeetingCancelledEmails).toHaveBeenCalledWith([
      { id: "b1", wasConfirmed: false },
      { id: "b2", wasConfirmed: true },
    ]);
  });

  it("leaves everything alone when the removed members had no meeting", async () => {
    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValue([]);

    expect(await cancelMeetingsOfRemovedParticipants("evt_1", ["u3"])).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sendMeetingCancelledEmails).not.toHaveBeenCalled();
  });
});
