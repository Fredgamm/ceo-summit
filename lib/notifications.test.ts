import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    meetingBooking: { count: vi.fn(), findMany: vi.fn() },
    opportunityContact: { count: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/conversations", () => ({ countUnreadMessages: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { countNotifications, loadNotifications } from "./notifications";

const NOW = new Date("2027-01-10T08:00:00Z");

describe("countNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.meetingBooking.count).mockResolvedValue(2);
    vi.mocked(prisma.opportunityContact.count).mockResolvedValue(1);
  });

  it("adds the meeting requests and the Deal Room contact requests waiting for an answer", async () => {
    expect(await countNotifications("bob", NOW)).toBe(3);
  });

  it("only counts requests addressed to the member, still pending and not expired", async () => {
    await countNotifications("bob", NOW);

    expect(prisma.meetingBooking.count).toHaveBeenCalledWith({
      where: { recipientId: "bob", status: "PENDING", expiresAt: { gt: NOW } },
    });
    expect(prisma.opportunityContact.count).toHaveBeenCalledWith({
      where: { receiverId: "bob", status: "PENDING" },
    });
  });

  it("does not count unread messages: they already have their own badge", async () => {
    await countNotifications("bob", NOW);

    expect(countUnreadMessages).not.toHaveBeenCalled();
  });
});

describe("loadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countUnreadMessages).mockResolvedValue(4);
    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValue([
      {
        id: "b1",
        slot: { startTime: new Date("2027-01-11T06:00:00Z") },
        event: { timezone: "Indian/Reunion" },
        requester: { name: "Alice E2E", company: { name: "E2E Alice SARL" } },
      },
    ] as never);
    vi.mocked(prisma.opportunityContact.findMany).mockResolvedValue([
      {
        id: "c1",
        opportunityId: "opp_1",
        opportunity: { title: "Logistique Océan Indien" },
        initiator: { name: "Paul Rakoto", company: null },
      },
    ] as never);
  });

  it("describes each meeting request, with the day and time in the event's time zone", async () => {
    const { items } = await loadNotifications("bob", NOW);

    expect(items[0]).toEqual({
      id: "meeting-b1",
      kind: "meeting",
      title: "Alice E2E, E2E Alice SARL vous demande un rendez-vous",
      detail: "11 janvier 2027, 10h00",
      href: "/profil?onglet=mes-rendez-vous",
      actionLabel: "Répondre",
    });
  });

  it("describes each Deal Room contact request, linking to its opportunity", async () => {
    const { items } = await loadNotifications("bob", NOW);

    expect(items[1]).toMatchObject({
      kind: "deal-room",
      title: "Paul Rakoto souhaite vous contacter",
      detail: "Opportunité « Logistique Océan Indien »",
      href: "/deal-room/opp_1",
    });
  });

  it("reports the unread messages separately", async () => {
    expect((await loadNotifications("bob", NOW)).unreadMessages).toBe(4);
  });

  it("is empty when nothing is waiting", async () => {
    vi.mocked(prisma.meetingBooking.findMany).mockResolvedValue([]);
    vi.mocked(prisma.opportunityContact.findMany).mockResolvedValue([]);
    vi.mocked(countUnreadMessages).mockResolvedValue(0);

    expect(await loadNotifications("bob", NOW)).toEqual({ items: [], unreadMessages: 0 });
  });
});
