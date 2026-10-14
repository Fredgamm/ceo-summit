import { describe, expect, it } from "vitest";

import { sniffMimeType, verifiedMimeType } from "./file-signature";

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v]))
  );

describe("sniffMimeType", () => {
  it("recognises the formats accepted by member uploads", () => {
    expect(sniffMimeType(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMimeType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMimeType(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffMimeType(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
  });

  it("does not recognise HTML or SVG, whatever the browser announces", () => {
    expect(sniffMimeType(bytes("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffMimeType(bytes("<svg xmlns="))).toBeNull();
  });
});

describe("verifiedMimeType", () => {
  it("returns the detected type only when it is allowed", () => {
    expect(verifiedMimeType(bytes("%PDF-1.4"), ["application/pdf"])).toBe("application/pdf");
    expect(verifiedMimeType(bytes(0xff, 0xd8, 0xff), ["application/pdf"])).toBeNull();
    expect(verifiedMimeType(bytes("not a pdf"), ["application/pdf"])).toBeNull();
  });
});
