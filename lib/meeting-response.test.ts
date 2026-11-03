import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/meeting-emails", () => ({
  sendMeetingConfirmedEmails: vi.fn().mockResolvedValue(undefined),
  sendMeetingDeclinedEmail: vi.fn().mockResolvedValue(undefined),
  sendMeetingExpiredEmails: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/meeting-participation", () => ({ meetingEventIdFor: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    meetingBooking: { findUnique: vi.fn(), updateMany: vi.fn() },
    meetingParticipantSlot: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { meetingEventIdFor } from "@/lib/meeting-participation";
import { sendMeetingConfirmedEmails, sendMeetingDeclinedEmail } from "@/lib/meeting-emails";
import { hashMeetingToken } from "@/lib/meeting-token";
import { loadMeetingByToken, respondToMeetingByToken } from "./meeting-response";

const FUTURE = new Date(Date.now() + 5 * 24 * 3600 * 1000);
const BY_TOKEN = {
  id: "booking_1",
  status: "PENDING",
  expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  recipientId: "user_b",
  slot: { startTime: FUTURE, endTime: new Date(FUTURE.getTime() + 1800_000) },
  event: { title: "CEO Summit 2027", timezone: "Indian/Reunion" },
  requester: { name: "Marie Andrianina", company: { name: "Océan Logistique" } },
};
const FOR_RESPONSE = {
  status: "PENDING",
  eventId: "evt_1",
  requesterId: "user_a",
  recipientId: "user_b",
  expiresAt: BY_TOKEN.expiresAt,
  event: { date: FUTURE, endDate: new Date(FUTURE.getTime() + 8 * 3600_000) },
};

describe("meeting response by email token (lot 7 bis, RG-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.meetingBooking.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.meetingParticipantSlot.updateMany).mockResolvedValue({ count: 2 });
    vi.mocked(meetingEventIdFor).mockResolvedValue("evt_1");
    vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
    // 1er appel : recherche par jeton ; 2e : lecture de la demande pour répondre.
    vi.mocked(prisma.meetingBooking.findUnique).mockImplementation((async (args: {
      where: { id?: string; decisionTokenHash?: string };
    }) => (args.where.decisionTokenHash ? BY_TOKEN : FOR_RESPONSE)) as never);
  });

  it("looks the meeting up by the hash of the token, never the token itself", async () => {
    await loadMeetingByToken("SECRET-TOKEN");

    expect(prisma.meetingBooking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { decisionTokenHash: hashMeetingToken("SECRET-TOKEN") },
      })
    );
    expect(JSON.stringify(vi.mocked(prisma.meetingBooking.findUnique).mock.calls)).not.toContain(
      "SECRET-TOKEN"
    );
  });

  it("an unknown token is refused, and nothing changes", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(null);

    expect(await respondToMeetingByToken("nope", "accepter")).toEqual({
      success: false,
      error: "Ce lien n'est pas valide.",
    });
    expect(prisma.meetingBooking.updateMany).not.toHaveBeenCalled();
  });

  it("« Accepter » confirms the meeting as the recipient and sends the confirmations", async () => {
    const result = await respondToMeetingByToken("T", "accepter");

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
    expect(sendMeetingConfirmedEmails).toHaveBeenCalledWith("booking_1");
  });

  it("« Décliner » frees both slots and tells the requester", async () => {
    const result = await respondToMeetingByToken("T", "decliner");

    expect(result.success).toBe(true);
    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", status: "PENDING" },
      data: { status: "DECLINED", respondedAt: expect.any(Date) },
    });
    expect(prisma.meetingParticipantSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingId: "booking_1" },
      data: { status: "FREE", bookingId: null },
    });
    expect(sendMeetingDeclinedEmail).toHaveBeenCalledWith("booking_1");
  });

  it("works only once: the same link answers nothing after the first response", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockImplementation((async (args: {
      where: { decisionTokenHash?: string };
    }) =>
      args.where.decisionTokenHash
        ? { ...BY_TOKEN, status: "CONFIRMED" }
        : { ...FOR_RESPONSE, status: "CONFIRMED" }) as never);

    expect(await respondToMeetingByToken("T", "decliner")).toEqual({
      success: false,
      error: "Cette demande n'est plus en attente.",
    });
    expect(prisma.meetingBooking.updateMany).not.toHaveBeenCalled();
    expect(sendMeetingDeclinedEmail).not.toHaveBeenCalled();
  });

  it("a response racing another one cannot succeed twice", async () => {
    vi.mocked(prisma.meetingBooking.updateMany).mockResolvedValue({ count: 0 });

    expect((await respondToMeetingByToken("T", "accepter")).success).toBe(false);
    expect(prisma.meetingParticipantSlot.updateMany).not.toHaveBeenCalled();
    expect(sendMeetingConfirmedEmails).not.toHaveBeenCalled();
  });

  it("does not refresh the page it answers from (it shows its own result)", async () => {
    await respondToMeetingByToken("T", "accepter");

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("an expired request cannot be accepted from the link", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockImplementation((async (args: {
      where: { decisionTokenHash?: string };
    }) =>
      args.where.decisionTokenHash
        ? BY_TOKEN
        : { ...FOR_RESPONSE, expiresAt: new Date(Date.now() - 60_000) }) as never);

    const result = await respondToMeetingByToken("T", "accepter");

    expect(result.success).toBe(false);
    expect(prisma.meetingBooking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  });

  it("reports the display status of the meeting for the page", async () => {
    const meeting = await loadMeetingByToken("T");

    expect(meeting).toMatchObject({
      status: "PENDING",
      requesterName: "Marie Andrianina",
      requesterCompany: "Océan Logistique",
    });

    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue({
      ...BY_TOKEN,
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    expect((await loadMeetingByToken("T"))?.status).toBe("EXPIRED");
  });
});
