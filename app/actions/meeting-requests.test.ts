import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/meeting-participation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meeting-participation")>();
  return { ...actual, meetingEventIdFor: vi.fn() };
});
vi.mock("@/lib/prisma", () => {
  const prisma = {
    meetingTimeSlot: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    meetingBooking: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    meetingParticipantSlot: { createMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { meetingEventIdFor } from "@/lib/meeting-participation";
import { acceptMeeting, declineMeeting, requestMeeting, withdrawMeeting } from "./meeting-requests";

const REQUESTER = {
  id: "user_a",
  name: "Marie",
  email: "marie@x.mg",
  phone: "+261 34 00 000 01",
  companyId: "company_a",
};
const RECIPIENT = {
  name: "Paul",
  email: "paul@x.mg",
  phone: "+262 692 00 00 00",
  companyId: "company_b",
};
const SLOT_START = new Date(Date.now() + 5 * 24 * 3600 * 1000);
const SLOT = {
  eventId: "evt_1",
  status: "PUBLISHED",
  startTime: SLOT_START,
  event: {
    date: SLOT_START,
    endDate: new Date(SLOT_START.getTime() + 8 * 3600 * 1000),
    timezone: "Indian/Reunion",
    meetingSetup: { status: "PUBLISHED" },
  },
};
const INPUT = {
  slotId: "slot_1",
  recipientId: "user_b",
  reason: "Échanger sur un partenariat logistique.",
};

describe("requestMeeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireViewer).mockResolvedValue({ success: true, viewer: REQUESTER } as never);
    vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue(SLOT as never);
    vi.mocked(meetingEventIdFor).mockResolvedValue("evt_1");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(RECIPIENT as never);
    vi.mocked(prisma.meetingBooking.count).mockResolvedValue(0);
    vi.mocked(prisma.meetingBooking.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.meetingBooking.create).mockResolvedValue({ id: "booking_1" } as never);
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 1 });
    // La transaction interactive exécute la fonction avec le client mocké.
    vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
  });

  it("creates the request and blocks both participants' slot (RG-03)", async () => {
    const result = await requestMeeting(INPUT);

    expect(result).toEqual({ success: true, data: { bookingId: "booking_1" } });
    expect(prisma.meetingBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: "evt_1",
          slotId: "slot_1",
          requesterId: "user_a",
          recipientId: "user_b",
          reason: INPUT.reason,
          // Plusieurs jours avant : 48 h après l'envoi.
          expiresAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { slotId: "slot_1", userId: "user_b", status: "FREE" },
      data: { status: "PENDING", bookingId: "booking_1" },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { slotId: "slot_1", userId: "user_a", status: "FREE" },
      data: { status: "PENDING", bookingId: "booking_1" },
    });
  });

  it("refuses a slot just taken by someone else (concurrent requests)", async () => {
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValueOnce({ count: 0 });

    const result = await requestMeeting(INPUT);

    expect(result).toEqual({
      success: false,
      error: "Ce créneau vient d'être pris ou n'est plus disponible.",
    });
  });

  it("refuses when the requester is not available on that slot", async () => {
    vi.mocked(prisma.meetingParticipantSlot.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await requestMeeting(INPUT);

    expect(result.success).toBe(false);
  });

  it("refuses a request to oneself (RG-01)", async () => {
    const result = await requestMeeting({ ...INPUT, recipientId: "user_a" });

    expect(result.success).toBe(false);
    expect(prisma.meetingBooking.create).not.toHaveBeenCalled();
  });

  it("requires a reason of 10 to 500 characters (RG-08)", async () => {
    expect((await requestMeeting({ ...INPUT, reason: "Bonjour" })).success).toBe(false);
    expect((await requestMeeting({ ...INPUT, reason: "x".repeat(501) })).success).toBe(false);
    expect(prisma.meetingBooking.create).not.toHaveBeenCalled();
  });

  it("requires both to be participants of this event through an offer (RG-02)", async () => {
    vi.mocked(meetingEventIdFor).mockImplementation(async (id) =>
      id === "user_b" ? null : "evt_1"
    );

    const result = await requestMeeting(INPUT);

    expect(result).toEqual({
      success: false,
      error: "Ce membre ne participe pas aux rendez-vous de cet événement.",
    });
  });

  it("requires a complete profile for both (RG-02)", async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      success: true,
      viewer: { ...REQUESTER, phone: null },
    } as never);
    expect((await requestMeeting(INPUT)).success).toBe(false);

    vi.mocked(requireViewer).mockResolvedValue({ success: true, viewer: REQUESTER } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...RECIPIENT, phone: "" } as never);
    expect((await requestMeeting(INPUT)).success).toBe(false);
    expect(prisma.meetingBooking.create).not.toHaveBeenCalled();
  });

  it("caps pending requests at 10 (RG-09)", async () => {
    vi.mocked(prisma.meetingBooking.count).mockResolvedValue(10);

    expect((await requestMeeting(INPUT)).success).toBe(false);
  });

  it("allows only one request or meeting between the same two people (RG-10)", async () => {
    vi.mocked(prisma.meetingBooking.findFirst).mockResolvedValue({ id: "booking_0" } as never);

    expect((await requestMeeting(INPUT)).success).toBe(false);
  });

  it("refuses a slot that already started, or an event that is over (RG-11)", async () => {
    vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
      ...SLOT,
      startTime: new Date(Date.now() - 60_000),
    } as never);
    expect((await requestMeeting(INPUT)).success).toBe(false);

    vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
      ...SLOT,
      event: { ...SLOT.event, date: new Date("2020-01-01"), endDate: new Date("2020-01-02") },
    } as never);
    expect(await requestMeeting(INPUT)).toEqual({
      success: false,
      error: "L'événement est terminé.",
    });
  });

  it("refuses a slot disabled by the admin", async () => {
    vi.mocked(prisma.meetingTimeSlot.findUnique).mockResolvedValue({
      ...SLOT,
      status: "DISABLED",
    } as never);

    expect((await requestMeeting(INPUT)).success).toBe(false);
  });
});

describe("acceptMeeting / declineMeeting / withdrawMeeting (lots 5 et 8)", () => {
  const RECIPIENT_VIEWER = { ...RECIPIENT, id: "user_b" };
  const PENDING = {
    status: "PENDING",
    eventId: "evt_1",
    requesterId: "user_a",
    recipientId: "user_b",
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    event: SLOT.event,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireViewer).mockResolvedValue({
      success: true,
      viewer: RECIPIENT_VIEWER,
    } as never);
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(PENDING as never);
    vi.mocked(prisma.meetingBooking.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 2 });
    vi.mocked(meetingEventIdFor).mockResolvedValue("evt_1");
    vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
  });

  it("accepting confirms the meeting and books both slots", async () => {
    const result = await acceptMeeting("booking_1");

    expect(result).toEqual({ success: true, data: undefined });
    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", status: "PENDING" },
      data: { status: "CONFIRMED", respondedAt: expect.any(Date) },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingId: "booking_1", status: "PENDING" },
      data: { status: "BOOKED" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: "user_b", action: "meeting.accept" }),
    });
  });

  it("declining frees both slots (RG-07)", async () => {
    const result = await declineMeeting("booking_1");

    expect(result.success).toBe(true);
    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", status: "PENDING" },
      data: { status: "DECLINED", respondedAt: expect.any(Date) },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingId: "booking_1" },
      data: { status: "FREE", bookingId: null },
    });
  });

  it("only the requester withdraws, and that frees both slots (RG-05, RG-07)", async () => {
    expect(await withdrawMeeting("booking_1")).toEqual({
      success: false,
      error: "Seul l'auteur de la demande peut la retirer.",
    });

    vi.mocked(requireViewer).mockResolvedValue({ success: true, viewer: REQUESTER } as never);
    expect((await withdrawMeeting("booking_1")).success).toBe(true);
    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", status: "PENDING" },
      data: { status: "WITHDRAWN" },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingId: "booking_1" },
      data: { status: "FREE", bookingId: null },
    });
  });

  it("only the recipient accepts or declines (RG-05)", async () => {
    vi.mocked(requireViewer).mockResolvedValue({ success: true, viewer: REQUESTER } as never);

    expect((await acceptMeeting("booking_1")).success).toBe(false);
    expect((await declineMeeting("booking_1")).success).toBe(false);
    expect(prisma.meetingBooking.updateMany).not.toHaveBeenCalled();
  });

  it("hides a request the viewer is not part of", async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      success: true,
      viewer: { ...REQUESTER, id: "user_c" },
    } as never);

    expect(await acceptMeeting("booking_1")).toEqual({
      success: false,
      error: "Demande introuvable.",
    });
  });

  it("refuses a request that is no longer pending, even when it changed meanwhile", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue({
      ...PENDING,
      status: "WITHDRAWN",
    } as never);
    expect((await acceptMeeting("booking_1")).success).toBe(false);

    // Retirée entre la lecture et la réponse : le passage conditionnel échoue.
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(PENDING as never);
    vi.mocked(prisma.meetingBooking.updateMany).mockResolvedValue({ count: 0 });
    expect(await acceptMeeting("booking_1")).toEqual({
      success: false,
      error: "Cette demande n'est plus en attente.",
    });
    expect(prisma.meetingParticipantSlot.updateMany).not.toHaveBeenCalled();
  });

  it("expires a request past its deadline instead of accepting it (RG-06)", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue({
      ...PENDING,
      expiresAt: new Date(Date.now() - 60_000),
    } as never);

    const result = await acceptMeeting("booking_1");

    expect(result).toEqual({
      success: false,
      error: "Cette demande a expiré : le créneau est de nouveau libre.",
    });
    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingId: "booking_1" },
      data: { status: "FREE", bookingId: null },
    });
  });

  it("requires the recipient to still be a participant to accept (RG-02)", async () => {
    vi.mocked(meetingEventIdFor).mockResolvedValue(null);

    expect((await acceptMeeting("booking_1")).success).toBe(false);
    expect(prisma.meetingBooking.updateMany).not.toHaveBeenCalled();
  });
});
