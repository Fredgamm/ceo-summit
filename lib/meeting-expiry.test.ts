import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    meetingBooking: { findMany: vi.fn(), updateMany: vi.fn() },
    meetingParticipantSlot: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { expireDueMeetings, expireMeetingBooking } from "./meeting-expiry";

describe("expireMeetingBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.meetingBooking.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
  });

  it("expires a pending request and frees both slots in the same transaction (RG-07)", async () => {
    expect(await expireMeetingBooking("b1")).toBe(true);

    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingId: "b1" },
      data: { status: "FREE", bookingId: null },
    });
  });

  it("leaves everything alone when the request was answered meanwhile", async () => {
    vi.mocked(prisma.meetingBooking.updateMany).mockResolvedValue({ count: 0 });

    expect(await expireMeetingBooking("b1")).toBe(false);
    expect(prisma.meetingParticipantSlot.updateMany).not.toHaveBeenCalled();
  });
});

describe("expireDueMeetings", () => {
  const NOW = new Date("2027-01-10T12:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
  });

  it("only looks at pending requests whose deadline has passed (RG-06)", async () => {
    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValue([]);

    expect(await expireDueMeetings(NOW)).toEqual([]);

    expect(prisma.meetingBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PENDING", expiresAt: { lte: NOW } } })
    );
  });

  it("returns the requests it really expired, not those answered in between", async () => {
    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValue([
      { id: "b1", requesterId: "a", recipientId: "b" },
      { id: "b2", requesterId: "c", recipientId: "d" },
      { id: "b3", requesterId: "e", recipientId: "f" },
    ] as never);
    // b2 a été acceptée entre la lecture et l'expiration.
    vi.mocked(prisma.meetingBooking.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const expired = await expireDueMeetings(NOW);

    expect(expired.map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledTimes(2);
  });

  it("is harmless when run twice in a row", async () => {
    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValueOnce([
      { id: "b1", requesterId: "a", recipientId: "b" },
    ] as never);
    vi.mocked(prisma.meetingBooking.updateMany).mockResolvedValueOnce({ count: 1 });
    expect(await expireDueMeetings(NOW)).toHaveLength(1);

    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValueOnce([]);
    expect(await expireDueMeetings(NOW)).toEqual([]);
  });
});
