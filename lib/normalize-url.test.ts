import { describe, expect, it } from "vitest";

import { normalizeUrl } from "./normalize-url";

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
