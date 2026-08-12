import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    eventRegistration: { findUnique: vi.fn() },
  },
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xxx") },
}));
vi.mock("@/lib/pdf/event-badge-pdf", () => ({
  renderEventBadgePdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-bytes")),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { renderEventBadgePdf } from "@/lib/pdf/event-badge-pdf";
import { GET } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

function makeRequest() {
  return new Request("http://localhost/evenements/event_1/badge/pdf");
}

describe("GET /evenements/[id]/badge/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: "event_1",
      title: "CEO Summit 2026",
      date: new Date("2026-11-15T09:00:00Z"),
      isOnline: false,
      location: "Saint-Denis",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre Rakoto",
      title: "CEO",
      avatarUrl: null,
      company: { name: "TechOcean", subscription: { status: "ACTIVE", plan: { rank: 2 } } },
    } as never);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(makeRequest(), { params: { id: "event_1" } });
    expect(res.status).toBe(401);
  });

  it("rejects when the registration isn't CONFIRMED (pending payment)", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      status: "PENDING_PAYMENT",
      badgeQrCode: "qr_1",
    } as never);

    const res = await GET(makeRequest(), { params: { id: "event_1" } });

    expect(res.status).toBe(403);
    expect(renderEventBadgePdf).not.toHaveBeenCalled();
  });

  it("rejects when there is no registration at all", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue(null);
    const res = await GET(makeRequest(), { params: { id: "event_1" } });
    expect(res.status).toBe(403);
  });

  it("streams a PDF for a confirmed registration", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      status: "CONFIRMED",
      badgeQrCode: "qr_1",
      plan: null,
    } as never);

    const res = await GET(makeRequest(), { params: { id: "event_1" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(renderEventBadgePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTitle: "CEO Summit 2026",
        participantName: "Jean-Pierre Rakoto",
        companyName: "TechOcean",
      })
    );
  });

  it("uses the event-specific plan name as the access label when one exists", async () => {
    vi.mocked(prisma.eventRegistration.findUnique).mockResolvedValue({
      status: "CONFIRMED",
      badgeQrCode: "qr_1",
      plan: { name: "Executive pass" },
    } as never);

    await GET(makeRequest(), { params: { id: "event_1" } });

    expect(renderEventBadgePdf).toHaveBeenCalledWith(
      expect.objectContaining({ accessLabel: "Executive pass" })
    );
  });
});
