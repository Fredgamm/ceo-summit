import { describe, expect, it } from "vitest";

import { badgeLabel, isMyCompanyActive, isProfileMenuActive, isUnder } from "./mobile-nav";

describe("isUnder", () => {
  it("matches the page itself and what is below it, never a sibling that shares the prefix", () => {
    expect(isUnder("/entreprise", "/entreprise")).toBe(true);
    expect(isUnder("/entreprise/paiement", "/entreprise")).toBe(true);
    // « /entreprises/[id] » est la fiche d'une autre entreprise, pas « Mon entreprise ».
    expect(isUnder("/entreprises/abc", "/entreprise")).toBe(false);
    expect(isUnder("/catalogue/services", "/catalogue")).toBe(true);
  });
});

describe("profile menu (barre du haut mobile)", () => {
  it("is active on the profile and on the company pages, since both live in that menu", () => {
    for (const path of ["/profil", "/profil/editer", "/entreprise", "/entreprise/paiement"]) {
      expect(isProfileMenuActive(path)).toBe(true);
    }
  });

  it("is not active elsewhere, including another company's page", () => {
    for (const path of ["/dashboard", "/membres/abc", "/entreprises/abc", "/messagerie"]) {
      expect(isProfileMenuActive(path)).toBe(false);
    }
  });

  it("« Mon entreprise » is lit only on the member's own company pages", () => {
    expect(isMyCompanyActive("/entreprise")).toBe(true);
    expect(isMyCompanyActive("/entreprises/abc")).toBe(false);
    expect(isMyCompanyActive("/profil")).toBe(false);
  });
});

describe("badgeLabel", () => {
  it("shows the number, then « 9+ » so it fits the small badge", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(120)).toBe("9+");
  });
});
