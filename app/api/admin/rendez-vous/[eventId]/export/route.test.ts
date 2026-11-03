import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { create: vi.fn() } } }));
vi.mock("@/lib/admin-auth", () => {
  class AdminAccessError extends Error {}
  return { AdminAccessError, requireAdmin: vi.fn() };
});
vi.mock("@/lib/meeting-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meeting-admin")>();
  return { ...actual, loadAdminMeetings: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { AdminAccessError, requireAdmin } from "@/lib/admin-auth";
import { loadAdminMeetings } from "@/lib/meeting-admin";
import { GET } from "./route";

const VIEW = {
  event: {
    id: "evt_1",
    title: "CEO Summit 2027",
    timezone: "Indian/Reunion",
    zone: "Espace B2B",
    accessInstructions: "Niveau 1",
  },
  days: ["2027-01-11"],
  counts: {},
  meetings: [
    {
      id: "b1",
      status: "CONFIRMED",
      dayKey: "2027-01-11",
      start: new Date("2027-01-11T06:00:00Z"),
      end: new Date("2027-01-11T06:30:00Z"),
      requester: {
        id: "m",
        name: "=HYPERLINK(evil)",
        company: "Océan",
        title: "",
        email: "",
        phone: "+262 1",
      },
      recipient: {
        id: "p",
        name: "Paul Rakoto",
        company: "Rakoto",
        title: "",
        email: "",
        phone: "+262 2",
      },
      reason: "Motif",
      createdAt: new Date(),
      respondedAt: null,
    },
  ],
};

const call = (query = "") =>
  GET(new Request(`http://localhost/api/admin/rendez-vous/evt_1/export${query}`), {
    params: Promise.resolve({ eventId: "evt_1" }),
  });

describe("GET /api/admin/rendez-vous/[eventId]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin_1" });
    vi.mocked(loadAdminMeetings).mockResolvedValue(VIEW as never);
  });

  it("is reserved to the « événements » section of the admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AdminAccessError("Accès refusé"));

    const res = await call();

    expect(res.status).toBe(403);
    expect(loadAdminMeetings).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(requireAdmin).toHaveBeenCalledWith("evenements");
  });

  it("returns an Excel-friendly CSV by default, with formula injection neutralised", async () => {
    const res = await call();
    const bytes = new Uint8Array(await res.arrayBuffer());
    // `Response.text()` retire le BOM à la lecture : on le vérifie sur les octets.
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/rendez-vous-ceo-summit-2027\.csv/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM pour Excel
    expect(csv.split("\r\n")[0]).toContain("Demandeur;Entreprise du demandeur;Email du demandeur");
    expect(csv).toContain("'=HYPERLINK(evil)"); // préfixé, donc affiché comme du texte
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });

  it("returns a real PDF with ?format=pdf", async () => {
    const res = await call("?format=pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());

    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/\.pdf"/);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("?vue=terrain exports the field list", async () => {
    const res = await call("?vue=terrain");

    expect(res.headers.get("content-disposition")).toMatch(/liste-terrain-/);
    expect((await res.text()).split("\r\n")[0]).toContain("Participant 1");
  });

  it("passes the page filters to the query, and ignores nonsense", async () => {
    await call("?statut=CONFIRMED&jour=2027-01-11");
    expect(loadAdminMeetings).toHaveBeenLastCalledWith("evt_1", {
      status: "CONFIRMED",
      day: "2027-01-11",
    });

    await call("?statut=oups&jour=demain");
    expect(loadAdminMeetings).toHaveBeenLastCalledWith("evt_1", {
      status: undefined,
      day: undefined,
    });
  });

  it("logs every export, since it carries names and phone numbers", async () => {
    await call("?format=pdf&vue=terrain");

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: "admin_1",
        action: "meeting.export",
        targetType: "Event",
        targetId: "evt_1",
        metadata: { vue: "terrain", format: "pdf", rows: 1 },
      },
    });
  });

  it("answers 404 for an unknown event", async () => {
    vi.mocked(loadAdminMeetings).mockResolvedValue(null);

    expect((await call()).status).toBe(404);
  });
});
