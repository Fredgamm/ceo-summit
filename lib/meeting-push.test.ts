import { describe, expect, it } from "vitest";

import { meetingPush, type MeetingPushKind } from "./meeting-push";

const input = {
  bookingId: "b1",
  partnerName: "Marie Andrianina",
  partnerCompany: "Océan Logistique",
  when: "11 janvier 2027, 10h00 – 10h30",
};

describe("meetingPush", () => {
  it("request: says who, when, and opens « Mes rendez-vous »", () => {
    expect(meetingPush("request", input)).toEqual({
      title: "Nouvelle demande de rendez-vous",
      body: "Marie Andrianina (Océan Logistique) · 11 janvier 2027, 10h00 – 10h30",
      url: "/profil?onglet=mes-rendez-vous",
      tag: "meeting-b1",
    });
  });

  it("works without a company", () => {
    expect(meetingPush("confirmed", { ...input, partnerCompany: null }).body).toBe(
      "Marie Andrianina · 11 janvier 2027, 10h00 – 10h30"
    );
  });

  it("declined: carries the partner's word when there is one", () => {
    expect(
      meetingPush("declined", { ...input, message: "Pas disponible, désolé." }).body
    ).toContain("Pas disponible, désolé.");
    expect(meetingPush("declined", input).body).toContain("ne peut pas vous recevoir");
  });

  it("cancelled: tells a confirmed meeting from a pending request", () => {
    expect(meetingPush("cancelled", { ...input, wasConfirmed: true }).title).toBe(
      "Rendez-vous annulé"
    );
    expect(meetingPush("cancelled", { ...input, wasConfirmed: false }).title).toBe(
      "Demande de rendez-vous annulée"
    );
  });

  it("slots-open: leads to « Mes créneaux »", () => {
    const p = meetingPush("slots-open", { eventTitle: "CEO Summit 2027" });
    expect(p.url).toBe("/profil?onglet=creneaux");
    expect(p.body).toContain("CEO Summit 2027");
  });

  it("every kind gives a title, a text and an internal link", () => {
    const kinds: MeetingPushKind[] = [
      "request",
      "confirmed",
      "declined",
      "partner-message",
      "expired-requester",
      "expired-recipient",
      "cancelled",
      "slots-open",
    ];
    for (const kind of kinds) {
      const p = meetingPush(kind, input);
      expect(p.title).not.toBe("");
      expect(p.body).not.toBe("");
      expect(p.url.startsWith("/")).toBe(true);
    }
  });
});
