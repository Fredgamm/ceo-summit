import { describe, expect, it } from "vitest";

import { canAccessSection, accessibleSections } from "./admin-rbac";

describe("canAccessSection", () => {
  it("grants SUPER_ADMIN every section", () => {
    expect(canAccessSection("SUPER_ADMIN", "parametres")).toBe(true);
    expect(canAccessSection("SUPER_ADMIN", "finances")).toBe(true);
  });

  it("keeps FINANCIER away from membres/parametres", () => {
    expect(canAccessSection("FINANCIER", "finances")).toBe(true);
    expect(canAccessSection("FINANCIER", "parametres")).toBe(false);
    expect(canAccessSection("FINANCIER", "membres")).toBe(false);
  });

  it("keeps MODERATEUR away from finances/parametres", () => {
    expect(canAccessSection("MODERATEUR", "membres")).toBe(true);
    expect(canAccessSection("MODERATEUR", "salles")).toBe(true);
    expect(canAccessSection("MODERATEUR", "finances")).toBe(false);
    expect(canAccessSection("MODERATEUR", "parametres")).toBe(false);
  });

  it("gives every role the dashboard", () => {
    expect(canAccessSection("SUPER_ADMIN", "dashboard")).toBe(true);
    expect(canAccessSection("MODERATEUR", "dashboard")).toBe(true);
    expect(canAccessSection("FINANCIER", "dashboard")).toBe(true);
  });
});

describe("accessibleSections", () => {
  it("returns the full list for SUPER_ADMIN", () => {
    expect(accessibleSections("SUPER_ADMIN")).toContain("parametres");
  });

  it("returns only the financier's sections for FINANCIER", () => {
    expect(accessibleSections("FINANCIER")).toEqual([
      "dashboard",
      "finances",
      "plans",
      "entreprises",
    ]);
  });
});
