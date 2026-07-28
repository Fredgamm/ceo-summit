import { describe, expect, it } from "vitest";

import {
  parseProgram,
  parseSpeakers,
  parseProgramText,
  programToText,
  parseSpeakersText,
  speakersToText,
} from "./event-content";

describe("parseProgram / parseSpeakers (read)", () => {
  it("keeps well-shaped program blocks and drops malformed ones", () => {
    const result = parseProgram([{ day: "Jour 1", items: ["a", "b"] }, { day: 5 }, null, "x"]);
    expect(result).toEqual([{ day: "Jour 1", items: ["a", "b"] }]);
  });

  it("returns an empty array for non-array input", () => {
    expect(parseProgram(null)).toEqual([]);
    expect(parseProgram("not an array")).toEqual([]);
  });

  it("keeps well-shaped speakers and drops malformed ones", () => {
    const result = parseSpeakers([{ name: "Sarah" }, { title: "no name" }, null]);
    expect(result).toEqual([{ name: "Sarah" }]);
  });
});

describe("parseProgramText / programToText (admin form round-trip)", () => {
  it("turns one item per line into a single unnamed block", () => {
    expect(parseProgramText("19h30 — Accueil\n20h00 — Dîner\n")).toEqual([
      { day: "Programme", items: ["19h30 — Accueil", "20h00 — Dîner"] },
    ]);
  });

  it("returns an empty array for blank text", () => {
    expect(parseProgramText("   \n  \n")).toEqual([]);
  });

  it("round-trips back to the same lines", () => {
    const text = "Étape 1\nÉtape 2";
    expect(programToText(parseProgramText(text))).toBe(text);
  });
});

describe("parseSpeakersText / speakersToText (admin form round-trip)", () => {
  it("parses 'Name | Title | Company' lines", () => {
    expect(parseSpeakersText("Sarah Razanamahery | DG | BNI Madagascar\nKaran Mehta")).toEqual([
      { name: "Sarah Razanamahery", title: "DG", company: "BNI Madagascar" },
      { name: "Karan Mehta", title: undefined, company: undefined },
    ]);
  });

  it("drops lines with no name", () => {
    expect(parseSpeakersText("| DG only")).toEqual([]);
  });

  it("round-trips back to the same text", () => {
    const text = "Sarah Razanamahery | DG | BNI Madagascar";
    expect(speakersToText(parseSpeakersText(text))).toBe(text);
  });
});
