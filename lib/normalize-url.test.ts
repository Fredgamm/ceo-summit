import { describe, expect, it } from "vitest";

import { normalizeUrl, safeHref } from "./normalize-url";

describe("normalizeUrl", () => {
  it("leaves an already-schemed URL untouched", () => {
    expect(normalizeUrl("https://linkedin.com/in/marie")).toBe("https://linkedin.com/in/marie");
    expect(normalizeUrl("http://example.mg")).toBe("http://example.mg");
  });

  it("prepends https:// to a bare domain", () => {
    expect(normalizeUrl("linkedin.com/in/marie")).toBe("https://linkedin.com/in/marie");
    expect(normalizeUrl("www.example.mg")).toBe("https://www.example.mg");
  });

  it("trims surrounding whitespace before checking the scheme", () => {
    expect(normalizeUrl("  example.mg  ")).toBe("https://example.mg");
  });

  it("returns an empty string unchanged", () => {
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("   ")).toBe("");
  });
});

describe("safeHref", () => {
  it("returns http(s) URLs", () => {
    expect(safeHref("https://example.mg/page")).toBe("https://example.mg/page");
    expect(safeHref("http://example.mg")).toBe("http://example.mg/");
  });

  it("rejects javascript:, data: and other non-http schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("  JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHref("vbscript:msgbox")).toBeNull();
  });

  it("rejects empty, missing or unparseable values", () => {
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});
