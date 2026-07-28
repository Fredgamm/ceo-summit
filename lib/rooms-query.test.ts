import { describe, expect, it } from "vitest";

import { buildRoomsWhere, meetsRoomAccess, ROOM_ACCESS_LABEL } from "./rooms-query";

describe("meetsRoomAccess", () => {
  it("lets any tier into an ALL_MEMBERS room", () => {
    expect(meetsRoomAccess("MEMBER", "ALL_MEMBERS")).toBe(true);
    expect(meetsRoomAccess("EXECUTIVE", "ALL_MEMBERS")).toBe(true);
    expect(meetsRoomAccess("CHAIRMAN", "ALL_MEMBERS")).toBe(true);
  });

  it("blocks a MEMBER from an EXECUTIVE_PLUS room", () => {
    expect(meetsRoomAccess("MEMBER", "EXECUTIVE_PLUS")).toBe(false);
    expect(meetsRoomAccess("EXECUTIVE", "EXECUTIVE_PLUS")).toBe(true);
    expect(meetsRoomAccess("CHAIRMAN", "EXECUTIVE_PLUS")).toBe(true);
  });

  it("only lets CHAIRMAN into a CHAIRMAN_ONLY room", () => {
    expect(meetsRoomAccess("EXECUTIVE", "CHAIRMAN_ONLY")).toBe(false);
    expect(meetsRoomAccess("CHAIRMAN", "CHAIRMAN_ONLY")).toBe(true);
  });

  it("blocks a viewer with no active membership", () => {
    expect(meetsRoomAccess(null, "ALL_MEMBERS")).toBe(false);
    expect(meetsRoomAccess(undefined, "ALL_MEMBERS")).toBe(false);
  });
});

describe("buildRoomsWhere", () => {
  it("always scopes to ACTIVE rooms with no filters", () => {
    expect(buildRoomsWhere({})).toEqual({ status: "ACTIVE" });
  });

  it("filters by a known sector", () => {
    expect(buildRoomsWhere({ secteur: "Énergie & Environnement" }).sector).toBe(
      "Énergie & Environnement"
    );
  });

  it("ignores an unknown sector", () => {
    expect(buildRoomsWhere({ secteur: "Bidon" }).sector).toBeUndefined();
  });

  it("filters by a known access level", () => {
    expect(buildRoomsWhere({ acces: "CHAIRMAN_ONLY" }).minTier).toBe("CHAIRMAN_ONLY");
  });

  it("ignores an unknown access level", () => {
    expect(buildRoomsWhere({ acces: "BIDON" }).minTier).toBeUndefined();
  });
});

describe("ROOM_ACCESS_LABEL", () => {
  it("has a label for every access level", () => {
    expect(ROOM_ACCESS_LABEL.ALL_MEMBERS).toBe("Tous membres");
    expect(ROOM_ACCESS_LABEL.EXECUTIVE_PLUS).toBe("Executive & Chairman");
    expect(ROOM_ACCESS_LABEL.CHAIRMAN_ONLY).toBe("Chairman uniquement");
  });
});
