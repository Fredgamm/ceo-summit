import { describe, expect, it } from "vitest";

import { PHONE_COUNTRIES, formatInternationalPhone, phoneCountryByName } from "./phone-countries";
import { COUNTRY_CATALOG } from "./referential-catalog";

describe("phone countries", () => {
  it("has unique ISO codes", () => {
    const isos = PHONE_COUNTRIES.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
  });

  it("covers the Indian Ocean countries of the referential", () => {
    for (const name of COUNTRY_CATALOG.slice(0, 6)) {
      expect(phoneCountryByName(name), name).toBeDefined();
    }
  });

  it("formats the stored number without the national leading zero", () => {
    expect(formatInternationalPhone("+261", "034 12  345 67")).toBe("+261 34 12 345 67");
    expect(formatInternationalPhone("+33", "6 12 34 56 78")).toBe("+33 6 12 34 56 78");
    expect(formatInternationalPhone("+261", "  ")).toBe("");
  });
});
