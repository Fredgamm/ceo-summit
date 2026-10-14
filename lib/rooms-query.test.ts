import { describe, expect, it } from "vitest";

import { buildRoomsWhere, meetsRoomAccess } from "./rooms-query";

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

  it("searches the room name and description, case-insensitively", () => {
    expect(buildRoomsWhere({ q: "  btp " }, VALID_SECTORS).OR).toEqual([
      { name: { contains: "btp", mode: "insensitive" } },
      { description: { contains: "btp", mode: "insensitive" } },
    ]);
  });

  it("ignores a blank search", () => {
    expect(buildRoomsWhere({ q: "   " }, VALID_SECTORS).OR).toBeUndefined();
  });
});
