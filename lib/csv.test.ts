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
});
