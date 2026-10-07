import { describe, expect, it } from "vitest";

import { excelDecimal, toCsv, toExcelCsv } from "./csv";

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

describe("toExcelCsv", () => {
  it("starts with a UTF-8 BOM and separates fields with semicolons", () => {
    expect(
      toExcelCsv([
        ["Méthode", "Montant (€)"],
        ["a", "b"],
      ])
    ).toBe("﻿Méthode;Montant (€)\r\na;b");
  });

  it("quotes a field containing a semicolon but not one containing a comma", () => {
    expect(toExcelCsv([["Dupont; Fils", "Rakoto, Jean"]])).toBe('﻿"Dupont; Fils";Rakoto, Jean');
  });
});

describe("excelDecimal", () => {
  it("uses a decimal comma for decimal numbers only", () => {
    expect(excelDecimal("750.00")).toBe("750,00");
    expect(excelDecimal("1500000")).toBe("1500000");
    expect(excelDecimal("Offre 2.0")).toBe("Offre 2.0");
  });
});
