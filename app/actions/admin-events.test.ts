import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    event: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    eventSession: { findMany: vi.fn(), update: vi.fn() },
    meetingTimeSlot: { findMany: vi.fn(), update: vi.fn() },
    eventAttachment: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
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
  location: "Hotel Carlton",
  isOnline: false,
  zoomMeetingId: "",
  date: "2026-10-14T19:30",
  endDate: "2026-10-14T23:00",
  capacity: 20,
  price: 300000,
  imageUrl: "",
};

const ATTACHMENT = {
  title: "Programme détaillé",
  url: "/api/dev/local-storage/ceo-summit-event-assets/events/attachments/abc/programme.pdf",
  fileName: "programme.pdf",
  mimeType: "application/pdf",
  sizeBytes: 120_000,
};

describe("admin event actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      timezone: "Indian/Antananarivo",
    } as never);
  });

  describe("createEvent", () => {
    it("reads the dates in the event's timezone, not the server's (module 21 D19)", async () => {
      vi.mocked(prisma.event.create).mockResolvedValue({ id: "evt_1" } as never);

      await createEvent({ ...VALID_INPUT, timezone: "Indian/Reunion" });

      const data = vi.mocked(prisma.event.create).mock.calls[0][0].data;
      expect(data.timezone).toBe("Indian/Reunion");
      expect((data.date as Date).toISOString()).toBe("2026-10-14T15:30:00.000Z");
      expect((data.endDate as Date).toISOString()).toBe("2026-10-14T19:00:00.000Z");
    });

    it("defaults to Madagascar time", async () => {
      vi.mocked(prisma.event.create).mockResolvedValue({ id: "evt_1" } as never);

      await createEvent(VALID_INPUT);

      const data = vi.mocked(prisma.event.create).mock.calls[0][0].data;
      expect(data.timezone).toBe("Indian/Antananarivo");
      expect((data.date as Date).toISOString()).toBe("2026-10-14T16:30:00.000Z");
    });

    it("rejects an unknown timezone", async () => {
      const result = await createEvent({ ...VALID_INPUT, timezone: "Mars/Olympus" });

      expect(result.success).toBe(false);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it("creates a draft event with its attachments, in order (module 21 D17)", async () => {
      vi.mocked(prisma.event.create).mockResolvedValue({ id: "evt_1" } as never);

      const result = await createEvent({ ...VALID_INPUT, attachments: [ATTACHMENT] });

      expect(result.success).toBe(true);
      const data = vi.mocked(prisma.event.create).mock.calls[0]![0].data;
      expect(data.status).toBe("DRAFT");
      expect(data.attachments).toEqual({
        createMany: { data: [{ ...ATTACHMENT, position: 0 }] },
      });
    });

    it("no longer writes speakers (D18: existing data stays untouched)", async () => {
      vi.mocked(prisma.event.create).mockResolvedValue({ id: "evt_1" } as never);

      await createEvent({ ...VALID_INPUT, speakersText: "Sarah | DG | BNI" });

      expect(vi.mocked(prisma.event.create).mock.calls[0]![0].data).not.toHaveProperty("speakers");
    });

    it("refuses an attachment that was not uploaded through the platform", async () => {
      const result = await createEvent({
        ...VALID_INPUT,
        attachments: [{ ...ATTACHMENT, url: "https://evil.example/programme.pdf" }],
      });

      expect(result.success).toBe(false);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it("refuses more than 10 attachments", async () => {
      const attachments = Array.from({ length: 11 }, (_, i) => ({
        ...ATTACHMENT,
        url: ATTACHMENT.url.replace("abc", `f${i}`),
      }));

      const result = await createEvent({ ...VALID_INPUT, attachments });

      expect(result.success).toBe(false);
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
    it("keeps the displayed hours of sessions and meeting slots when the timezone changes", async () => {
      vi.mocked(prisma.eventSession.findMany).mockResolvedValue([
        // 14h00 à Madagascar
        {
          id: "sess_1",
          startTime: new Date("2026-10-15T11:00:00Z"),
          endTime: new Date("2026-10-15T12:00:00Z"),
        },
      ] as never);
      vi.mocked(prisma.meetingTimeSlot.findMany).mockResolvedValue([] as never);

      const result = await updateEvent("evt_1", { ...VALID_INPUT, timezone: "Indian/Reunion" });

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
      // 14h00 à La Réunion
      expect(prisma.eventSession.update).toHaveBeenCalledWith({
        where: { id: "sess_1" },
        data: {
          startTime: new Date("2026-10-15T10:00:00Z"),
          endTime: new Date("2026-10-15T11:00:00Z"),
        },
      });
    });

    it("updates the event's fields", async () => {
      const result = await updateEvent("evt_1", VALID_INPUT);
      expect(result.success).toBe(true);
      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "evt_1" } })
      );
    });

    it("replaces the attachment list with the form's, in one transaction", async () => {
      const second = {
        ...ATTACHMENT,
        title: "Plan d'accès",
        url: ATTACHMENT.url.replace("abc", "def"),
      };

      await updateEvent("evt_1", { ...VALID_INPUT, attachments: [second, ATTACHMENT] });

      expect(prisma.eventAttachment.deleteMany).toHaveBeenCalledWith({
        where: { eventId: "evt_1" },
      });
      expect(prisma.eventAttachment.createMany).toHaveBeenCalledWith({
        data: [
          { ...second, position: 0, eventId: "evt_1" },
          { ...ATTACHMENT, position: 1, eventId: "evt_1" },
        ],
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
