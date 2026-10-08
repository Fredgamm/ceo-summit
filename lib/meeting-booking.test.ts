import { describe, expect, it } from "vitest";

import { meetingRequestExpiry } from "./meeting-booking";

const REUNION = "Indian/Reunion";
// Créneau jeudi 11 mars 2027, 14h00 à La Réunion = 10h00 UTC.
const SLOT = new Date("2027-03-11T10:00:00Z");

describe("meetingRequestExpiry (RG-06, D13)", () => {
  it("same day: expires at the slot's start", () => {
    // jeudi 11h00 La Réunion
    expect(meetingRequestExpiry(new Date("2027-03-11T07:00:00Z"), SLOT, REUNION)).toEqual(SLOT);
    // jeudi 13h45
    expect(meetingRequestExpiry(new Date("2027-03-11T09:45:00Z"), SLOT, REUNION)).toEqual(SLOT);
  });

  it("the day before: 10 minutes before the slot when that comes before 48 h", () => {
    // mercredi 18h00 La Réunion → jeudi 13h50
    expect(meetingRequestExpiry(new Date("2027-03-10T14:00:00Z"), SLOT, REUNION)).toEqual(
      new Date("2027-03-11T09:50:00Z")
    );
  });

  it("several days before: 48 hours after sending", () => {
    // lundi 10h00 La Réunion → mercredi 10h00
    expect(meetingRequestExpiry(new Date("2027-03-08T06:00:00Z"), SLOT, REUNION)).toEqual(
      new Date("2027-03-10T06:00:00Z")
    );
  });

  it("judges « same day » in the event's timezone, not UTC", () => {
    // jeudi 01h00 à La Réunion = mercredi 21h00 UTC : c'est le jour même.
    expect(meetingRequestExpiry(new Date("2027-03-10T21:00:00Z"), SLOT, REUNION)).toEqual(SLOT);
  });
});
