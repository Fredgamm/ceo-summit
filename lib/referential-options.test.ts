import { describe, expect, it } from "vitest";

import {
  filterReferentialOptions,
  normalizeForSearch,
  visibleReferentialOptions,
} from "./referential-options";

const COUNTRIES = [
  "Madagascar",
  "Île Maurice",
  "La Réunion",
  "Comores",
  "Mayotte",
  "Seychelles",
  "Mozambique",
  "Tanzanie",
  "Kenya",
  "Afrique du Sud",
  "Algérie",
  "Égypte",
  "France",
];

describe("normalizeForSearch", () => {
  it("ignores case and accents", () => {
    expect(normalizeForSearch("  Île Maurice ")).toBe("ile maurice");
    expect(normalizeForSearch("Égypte")).toBe(normalizeForSearch("egypte"));
  });
});

describe("filterReferentialOptions", () => {
  it("matches without accents or case", () => {
    expect(filterReferentialOptions(COUNTRIES, "egy")).toEqual(["Égypte"]);
    expect(filterReferentialOptions(COUNTRIES, "REUNION")).toEqual(["La Réunion"]);
  });

  it("searches the whole catalogue, priority values included", () => {
    expect(filterReferentialOptions(COUNTRIES, "ma")).toEqual([
      "Madagascar",
      "Île Maurice",
      "Mayotte",
    ]);
  });

  it("returns everything for an empty query", () => {
    expect(filterReferentialOptions(COUNTRIES, "  ")).toHaveLength(COUNTRIES.length);
  });
});

describe("visibleReferentialOptions", () => {
  it("shows the first 10 values by default", () => {
    expect(visibleReferentialOptions(COUNTRIES, [])).toEqual(COUNTRIES.slice(0, 10));
  });

  it("keeps a selected value found by search visible", () => {
    expect(visibleReferentialOptions(COUNTRIES, ["France"])).toEqual([
      ...COUNTRIES.slice(0, 10),
      "France",
    ]);
  });

  it("does not duplicate a selected priority value or keep unknown/empty ones", () => {
    expect(visibleReferentialOptions(COUNTRIES, ["Kenya", "", "Narnia"])).toEqual(
      COUNTRIES.slice(0, 10)
    );
  });
});
