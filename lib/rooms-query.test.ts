import { describe, expect, it } from "vitest";

import { buildRoomsWhere, meetsRoomAccess, ROOM_ACCESS_LABEL } from "./rooms-query";

/**
 * Décision d'architecture (sept. 2026, conception/09) — accès égal pour tout
 * membre dont l'entreprise a une offre active/validée : `minTier` n'est plus
 * comparé, seule la présence d'un tier (= accès plateforme) compte.
 */
describe("meetsRoomAccess", () => {
  it("lets any tier into any room regardless of minTier", () => {
    expect(meetsRoomAccess("MEMBER", "ALL_MEMBERS")).toBe(true);
    expect(meetsRoomAccess("MEMBER", "EXECUTIVE_PLUS")).toBe(true);
    expect(meetsRoomAccess("MEMBER", "CHAIRMAN_ONLY")).toBe(true);
    expect(meetsRoomAccess("EXECUTIVE", "CHAIRMAN_ONLY")).toBe(true);
    expect(meetsRoomAccess("CHAIRMAN", "CHAIRMAN_ONLY")).toBe(true);
  });

  it("blocks a viewer with no active platform access", () => {
    expect(meetsRoomAccess(null, "ALL_MEMBERS")).toBe(false);
    expect(meetsRoomAccess(undefined, "ALL_MEMBERS")).toBe(false);
    expect(meetsRoomAccess(null, "CHAIRMAN_ONLY")).toBe(false);
  });
});

const VALID_SECTORS = ["Énergie & Environnement"];

describe("buildRoomsWhere", () => {
  it("always scopes to ACTIVE rooms with no filters", () => {
    expect(buildRoomsWhere({}, VALID_SECTORS)).toEqual({ status: "ACTIVE" });
  });

  it("filters by a known sector", () => {
    expect(buildRoomsWhere({ secteur: "Énergie & Environnement" }, VALID_SECTORS).sector).toBe(
      "Énergie & Environnement"
    );
  });

  it("ignores an unknown sector", () => {
    expect(buildRoomsWhere({ secteur: "Bidon" }, VALID_SECTORS).sector).toBeUndefined();
  });

  it("filters by a known access level", () => {
    expect(buildRoomsWhere({ acces: "CHAIRMAN_ONLY" }, VALID_SECTORS).minTier).toBe(
      "CHAIRMAN_ONLY"
    );
  });

  it("ignores an unknown access level", () => {
    expect(buildRoomsWhere({ acces: "BIDON" }, VALID_SECTORS).minTier).toBeUndefined();
  });
});

describe("ROOM_ACCESS_LABEL", () => {
  it("has a label for every access level", () => {
    expect(ROOM_ACCESS_LABEL.ALL_MEMBERS).toBe("Tous membres");
    expect(ROOM_ACCESS_LABEL.EXECUTIVE_PLUS).toBe("Executive & Chairman");
    expect(ROOM_ACCESS_LABEL.CHAIRMAN_ONLY).toBe("Chairman uniquement");
  });
});
