import { describe, expect, it } from "vitest";

import {
  attachmentKindLabel,
  detectAttachmentType,
  formatFileSize,
  safeFileName,
} from "./event-attachments";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

describe("detectAttachmentType", () => {
  it("accepts allowed types whose content matches the extension", () => {
    expect(detectAttachmentType("Programme.PDF", PDF)).toEqual({
      mime: "application/pdf",
      label: "PDF",
    });
    expect(detectAttachmentType("brochure.docx", ZIP)?.label).toBe("Word");
    expect(detectAttachmentType("budget.xlsx", ZIP)?.label).toBe("Excel");
    expect(detectAttachmentType("deck.ppt", OLE)?.label).toBe("PowerPoint");
    expect(detectAttachmentType("plan.png", bytes(0x89, 0x50, 0x4e, 0x47))?.label).toBe("Image");
  });

  it("refuses a disguised file", () => {
    expect(detectAttachmentType("programme.pdf", HTML)).toBeNull();
    expect(detectAttachmentType("brochure.docx", PDF)).toBeNull();
  });

  it("refuses other extensions", () => {
    expect(detectAttachmentType("page.html", HTML)).toBeNull();
    expect(detectAttachmentType("archive.zip", ZIP)).toBeNull();
    expect(detectAttachmentType("sans-extension", PDF)).toBeNull();
  });
});

describe("helpers", () => {
  it("builds a safe storage name", () => {
    expect(safeFileName("Plan d'accès — Hôtel.PDF")).toBe("plan-d-acces-hotel.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName("***.pdf")).toBe("document.pdf");
  });

  it("labels the kind from the stored type", () => {
    expect(attachmentKindLabel("application/pdf")).toBe("PDF");
    expect(attachmentKindLabel("text/html")).toBe("Fichier");
  });

  it("formats sizes in French", () => {
    expect(formatFileSize(1_258_291)).toBe("1,2 Mo");
    expect(formatFileSize(350 * 1024)).toBe("350 ko");
  });
});
