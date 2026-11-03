import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { event: { findUnique: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import {
  buildFieldListTable,
  buildMeetingsListTable,
  groupFieldList,
  loadAdminMeetings,
  parseAdminMeetingFilters,
} from "./meeting-admin";

// Réunion = UTC+4 : 10h00 le 11 janvier 2027 = 06h00 UTC.
const NOW = new Date("2027-01-10T08:00:00Z");
const user = (id: string, name: string, company: string) => ({
  id,
  name,
  title: "Directeur",
  email: `${id}@x.re`,
  phone: `+262 ${id}`,
  company: { name: company },
});
const booking = (id: string, status: string, startUtc: string, extra = {}) => ({
  id,
  status,
  reason: `Motif ${id}`,
  expiresAt: new Date("2027-01-10T20:00:00Z"),
  createdAt: new Date("2027-01-09T08:00:00Z"),
  respondedAt: null,
  slot: {
    startTime: new Date(startUtc),
    endTime: new Date(new Date(startUtc).getTime() + 30 * 60_000),
  },
  requester: user("marie", "Marie Andrianina", "Océan Logistique"),
  recipient: user("paul", "Paul Rakoto", "Rakoto Holding"),
  ...extra,
});

const EVENT = {
  id: "evt_1",
  title: "CEO Summit 2027 — La Réunion",
  timezone: "Indian/Reunion",
  meetingSetup: { zone: "Espace B2B", accessInstructions: "Niveau 1" },
  meetingSlots: [
    { startTime: new Date("2027-01-11T06:00:00Z") },
    { startTime: new Date("2027-01-11T06:30:00Z") },
    { startTime: new Date("2027-01-12T06:00:00Z") },
  ],
  meetings: [
    booking("b1", "CONFIRMED", "2027-01-11T06:00:00Z"),
    booking("b2", "PENDING", "2027-01-11T06:30:00Z"),
    booking("b3", "DECLINED", "2027-01-12T06:00:00Z"),
    // En attente mais échue : affichée « expirée » (RG-06), comme côté membre.
    booking("b4", "PENDING", "2027-01-12T06:30:00Z", {
      expiresAt: new Date("2027-01-10T07:00:00Z"),
    }),
  ],
};

describe("loadAdminMeetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);
  });

  it("counts by display status and lists the days with slots", async () => {
    const view = await loadAdminMeetings("evt_1", {}, NOW);

    expect(view!.days).toEqual(["2027-01-11", "2027-01-12"]);
    expect(view!.counts).toMatchObject({
      all: 4,
      CONFIRMED: 1,
      PENDING: 1,
      DECLINED: 1,
      EXPIRED: 1,
    });
    expect(view!.meetings.map((m) => m.id)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(view!.event).toMatchObject({ zone: "Espace B2B", timezone: "Indian/Reunion" });
  });

  it("filters by status, and the counts still show every status of the day", async () => {
    const view = await loadAdminMeetings("evt_1", { status: "PENDING" }, NOW);

    expect(view!.meetings.map((m) => m.id)).toEqual(["b2"]);
    expect(view!.counts.all).toBe(4);
  });

  it("filters by day in the event time zone", async () => {
    const view = await loadAdminMeetings("evt_1", { day: "2027-01-12" }, NOW);

    expect(view!.meetings.map((m) => m.id)).toEqual(["b3", "b4"]);
    expect(view!.counts.all).toBe(2);
  });

  it("only exposes phones and emails for a confirmed or completed meeting (RG-04)", async () => {
    const view = await loadAdminMeetings("evt_1", {}, NOW);

    const byId = Object.fromEntries(view!.meetings.map((m) => [m.id, m]));
    expect(byId.b1.requester).toMatchObject({ phone: "+262 marie", email: "marie@x.re" });
    expect(byId.b1.recipient).toMatchObject({ phone: "+262 paul", email: "paul@x.re" });
    for (const id of ["b2", "b3", "b4"]) {
      expect(byId[id].requester).toMatchObject({ phone: "", email: "" });
      expect(byId[id].recipient).toMatchObject({ phone: "", email: "" });
    }
  });

  it("a confirmed meeting whose slot is over becomes « terminé » and keeps its contacts", async () => {
    const view = await loadAdminMeetings("evt_1", {}, new Date("2027-01-11T08:00:00Z"));

    const b1 = view!.meetings.find((m) => m.id === "b1")!;
    expect(b1.status).toBe("COMPLETED");
    expect(b1.requester.phone).toBe("+262 marie");
  });

  it("returns null for an unknown event", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

    expect(await loadAdminMeetings("nope")).toBeNull();
  });
});

describe("parseAdminMeetingFilters", () => {
  it("accepts known statuses and well-formed days only", () => {
    expect(parseAdminMeetingFilters({ statut: "CONFIRMED", jour: "2027-01-11" })).toEqual({
      status: "CONFIRMED",
      day: "2027-01-11",
    });
    expect(parseAdminMeetingFilters({ statut: "'; DROP TABLE", jour: "demain" })).toEqual({
      status: undefined,
      day: undefined,
    });
    expect(parseAdminMeetingFilters({})).toEqual({ status: undefined, day: undefined });
  });
});

describe("tables", () => {
  let view: NonNullable<Awaited<ReturnType<typeof loadAdminMeetings>>>;
  beforeEach(async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(EVENT as never);
    view = (await loadAdminMeetings("evt_1", {}, NOW))!;
  });

  it("list: one row per meeting, same column count as the header, times in the event zone", () => {
    const table = buildMeetingsListTable(view, {});

    expect(table.rows).toHaveLength(4);
    for (const row of table.rows) expect(row).toHaveLength(table.header.length);
    expect(table.columnFlex).toHaveLength(table.header.length);
    expect(table.rows[0]).toEqual([
      "11 janvier 2027",
      "10h00 – 10h30",
      "Confirmé",
      "Marie Andrianina",
      "Océan Logistique",
      "Paul Rakoto",
      "Rakoto Holding",
      "+262 marie",
      "+262 paul",
      "Motif b1",
    ]);
    // Une demande en attente n'expose aucun téléphone.
    expect(table.rows[1].slice(7, 9)).toEqual(["", ""]);
    expect(table.rows[3][2]).toBe("Expiré");
  });

  it("list: the subtitle states the filters applied", () => {
    const table = buildMeetingsListTable(view, { status: "CONFIRMED", day: "2027-01-11" });

    expect(table.subtitle).toContain("Confirmé");
    expect(table.subtitle).toContain("11 janvier 2027");
  });

  it("field list: only the meetings that will take place, with both phones", () => {
    const table = buildFieldListTable(view, {});

    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toEqual([
      "11 janvier 2027",
      "10h00 – 10h30",
      "Marie Andrianina",
      "Océan Logistique",
      "+262 marie",
      "Paul Rakoto",
      "Rakoto Holding",
      "+262 paul",
    ]);
    expect(table.subtitle).toContain("Espace B2B");
    expect(table.title).toContain("Liste terrain");
  });

  it("field list on screen: grouped by day then by slot", () => {
    const groups = groupFieldList(view);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("11 janvier 2027");
    expect(groups[0].slots).toEqual([
      { range: "10h00 – 10h30", meetings: [expect.objectContaining({ id: "b1" })] },
    ]);
  });
});
