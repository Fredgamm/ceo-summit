import { describe, expect, it } from "vitest";

import { defaultDay, meetingCta, slotPeriod, visitorSlotLabel } from "./meeting-request-ui";

const OK = {
  existingBooking: null,
  viewerMissingFields: [] as string[],
  memberUnavailable: false,
  hasFreeSlot: true,
};

describe("meetingCta", () => {
  it("offers to request a meeting when everything allows it", () => {
    expect(meetingCta(OK)).toEqual({ kind: "request", label: "Demander un rendez-vous" });
  });

  it("points to the existing request or meeting instead (one per pair, RG-10)", () => {
    expect(meetingCta({ ...OK, existingBooking: { status: "PENDING" } })).toEqual({
      kind: "view",
      label: "Voir ma demande",
    });
    expect(meetingCta({ ...OK, existingBooking: { status: "CONFIRMED" } })).toEqual({
      kind: "view",
      label: "Voir mon rendez-vous",
    });
  });

  it("an existing meeting wins over every other state", () => {
    const cta = meetingCta({
      existingBooking: { status: "CONFIRMED" },
      viewerMissingFields: ["téléphone"],
      memberUnavailable: true,
      hasFreeSlot: false,
    });
    expect(cta.kind).toBe("view");
  });

  it("asks the visitor to complete their profile first (RG-02)", () => {
    expect(meetingCta({ ...OK, viewerMissingFields: ["téléphone"] })).toEqual({
      kind: "complete-profile",
      label: "Compléter mon profil",
    });
  });

  it("is disabled, with the reason, when the member cannot receive requests", () => {
    const cta = meetingCta({ ...OK, memberUnavailable: true });
    expect(cta).toMatchObject({ kind: "disabled", label: "Rendez-vous indisponible" });
  });

  it("is disabled when the member has no free slot left", () => {
    expect(meetingCta({ ...OK, hasFreeSlot: false })).toMatchObject({
      kind: "disabled",
      label: "Aucun créneau libre",
    });
  });
});

describe("visitorSlotLabel", () => {
  it("has no label for a free slot, and one short word for the others", () => {
    expect(visitorSlotLabel("available")).toBeNull();
    expect(visitorSlotLabel("taken")).toBe("Réservé");
    expect(visitorSlotLabel("inactive")).toBe("Inactif");
    expect(visitorSlotLabel("you-unavailable")).toBe("Occupé");
    expect(visitorSlotLabel("past")).toBe("Passé");
  });

  it("keeps every label short enough for a 2-column mobile grid", () => {
    for (const state of ["taken", "inactive", "you-unavailable", "past"] as const) {
      expect(visitorSlotLabel(state)!.length).toBeLessThanOrEqual(7);
    }
  });
});

describe("slotPeriod", () => {
  it("splits the day at noon", () => {
    expect(slotPeriod("09h30 – 10h00")).toBe("morning");
    expect(slotPeriod("11h30 – 12h00")).toBe("morning");
    expect(slotPeriod("12h00 – 12h30")).toBe("afternoon");
    expect(slotPeriod("16h30 – 17h00")).toBe("afternoon");
  });
});

describe("defaultDay", () => {
  const day = (key: string, ...states: ("available" | "taken")[]) => ({
    key,
    slots: states.map((state) => ({ state })),
  });

  it("opens on the first day that still has a free slot", () => {
    expect(defaultDay([day("2027-01-11", "taken"), day("2027-01-12", "taken", "available")])).toBe(
      "2027-01-12"
    );
  });

  it("falls back to the first day, and to nothing when there is no day", () => {
    expect(defaultDay([day("2027-01-11", "taken"), day("2027-01-12", "taken")])).toBe("2027-01-11");
    expect(defaultDay([])).toBeNull();
  });
});
