import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins rows with CRLF and fields with commas", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c", "d"],
      ])
    ).toBe("a,b\r\nc,d");
  });

  it("quotes fields containing a comma", () => {
    expect(toCsv([["Rakoto, Jean"]])).toBe('"Rakoto, Jean"');
  });

  it("quotes and escapes fields containing double quotes", () => {
    expect(toCsv([['Say "hi"']])).toBe('"Say ""hi"""');
  });

  it("quotes fields containing a newline", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"');
  });

  it("leaves plain fields unquoted", () => {
    expect(toCsv([["plain"]])).toBe("plain");
  });

  // 25 septembre 2026 (audit MVP) — injection de formule CSV.
  it.each(['=HYPERLINK("http://x")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "neutralises a formula-looking field (%j) with a leading quote",
    (field) => {
      const out = toCsv([[field]]);
      expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
    }
  );

  it("still quotes a neutralised field that needs quoting", () => {
    expect(toCsv([['=1,"a"']])).toBe(`"'=1,""a"""`);
  });

  it("leaves plain negative numbers alone (finance amounts stay numeric)", () => {
    expect(toCsv([["-150000", "-12.5"]])).toBe("-150000,-12.5");
  });

  it("leaves fields with a trigger character elsewhere untouched", () => {
    expect(toCsv([["jean-pierre@example.mg"]])).toBe("jean-pierre@example.mg");
  });
});
