import { describe, expect, it } from "vitest";

import {
  ACCEPT_QUICK_REPLIES,
  DECLINE_QUICK_REPLIES,
  QUICK_REASONS,
  dayTile,
  applyQuickReason,
  dayParts,
  defaultDay,
  freeLabel,
  meetingCta,
  reasonHint,
  slotPeriod,
  visitorSlotLabel,
} from "./meeting-request-ui";

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
      label: "Demander un rendez-vous",
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

describe("QUICK_REASONS", () => {
  it("every ready-made reason is long enough to be sent as is (min 10)", () => {
    for (const r of QUICK_REASONS) expect(r.text.length).toBeGreaterThanOrEqual(10);
  });
});

describe("applyQuickReason", () => {
  const [first, second] = QUICK_REASONS;

  it("fills an empty field", () => {
    expect(applyQuickReason("", first.text, 500)).toBe(first.text);
    expect(applyQuickReason("   ", first.text, 500)).toBe(first.text);
  });

  it("switches from one ready-made reason to another instead of piling them up", () => {
    expect(applyQuickReason(first.text, second.text, 500)).toBe(second.text);
  });

  it("never overwrites what the person typed: it adds after it", () => {
    expect(applyQuickReason("Bonjour, nous nous sommes croisés.", second.text, 500)).toBe(
      `Bonjour, nous nous sommes croisés. ${second.text}`
    );
  });

  it("stays within the maximum length", () => {
    expect(applyQuickReason("x".repeat(490), first.text, 500)).toHaveLength(500);
  });
});

describe("reasonHint", () => {
  it("says what is missing, in plain words", () => {
    expect(reasonHint(0, 10)).toBe("Choisissez un motif ci-dessus, ou écrivez le vôtre.");
    expect(reasonHint(6, 10)).toBe("Encore 4 caractères pour pouvoir envoyer.");
    expect(reasonHint(9, 10)).toBe("Encore 1 caractère pour pouvoir envoyer.");
  });

  it("is silent once the reason is long enough", () => {
    expect(reasonHint(10, 10)).toBeNull();
    expect(reasonHint(120, 10)).toBeNull();
  });
});

describe("dayParts", () => {
  it("gives the weekday and the date, whatever the device time zone", () => {
    expect(dayParts("2027-01-11")).toEqual({ weekday: "lundi", date: "11 janvier" });
    expect(dayParts("2027-01-12")).toEqual({ weekday: "mardi", date: "12 janvier" });
  });
});

describe("freeLabel", () => {
  it("counts the free slots, with the right plural", () => {
    expect(freeLabel(12)).toBe("12 libres");
    expect(freeLabel(1)).toBe("1 libre");
    expect(freeLabel(0)).toBe("Complet");
  });
});

describe("réponses toutes prêtes (accepter / refuser)", () => {
  it("each fits the 300-character limit on its own, and is never empty", () => {
    for (const r of [...ACCEPT_QUICK_REPLIES, ...DECLINE_QUICK_REPLIES]) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.text.length).toBeLessThanOrEqual(300);
    }
  });

  it("can be combined with what the person typed, within the limit", () => {
    const typed = "Je suis en chemise bleue.";
    const combined = applyQuickReason(typed, ACCEPT_QUICK_REPLIES[0].text, 300);
    expect(combined).toBe(`${typed} ${ACCEPT_QUICK_REPLIES[0].text}`);
    expect(combined.length).toBeLessThanOrEqual(300);
  });
});

describe("dayTile", () => {
  it("gives the short weekday, the day number and the short month", () => {
    expect(dayTile("2027-01-11")).toEqual({ weekday: "lun", day: "11", month: "janv" });
    expect(dayTile("2027-03-02")).toEqual({ weekday: "mar", day: "2", month: "mars" });
  });
});
