import { describe, expect, it } from "vitest";

import { parseSpeakers, parseSpeakersText, speakersToText } from "./event-content";

describe("parseSpeakers (read)", () => {
  it("keeps well-shaped speakers and drops malformed ones", () => {
    const result = parseSpeakers([{ name: "Sarah" }, { title: "no name" }, null]);
    expect(result).toEqual([{ name: "Sarah" }]);
  });

  it("returns an empty array for non-array input", () => {
    expect(parseSpeakers(null)).toEqual([]);
    expect(parseSpeakers("not an array")).toEqual([]);
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
