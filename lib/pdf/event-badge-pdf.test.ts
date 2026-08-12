import { describe, expect, it } from "vitest";

import { renderEventBadgePdf } from "./event-badge-pdf";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/**
 * Badge PDF téléchargeable (7 août 2026) — pas de mock ici (contrairement à
 * `route.test.ts`) : c'est le seul endroit qui exerce réellement
 * @react-pdf/renderer, une dépendance neuve pour ce projet.
 */
describe("renderEventBadgePdf", () => {
  it("renders a valid PDF buffer with a participant photo", async () => {
    const pdf = await renderEventBadgePdf({
      eventTitle: "CEO Summit 2026 — La Réunion",
      eventDateLabel: "15 novembre 2026",
      eventLocation: "Palais des Congrès, Saint-Denis",
      participantName: "Jean-Pierre Rakoto",
      participantTitle: "CEO",
      companyName: "TechOcean",
      avatarUrl: TINY_PNG_DATA_URL,
      accessLabel: "Executive pass",
      qrCodeDataUrl: TINY_PNG_DATA_URL,
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders without a photo, falling back to initials", async () => {
    const pdf = await renderEventBadgePdf({
      eventTitle: "CEO Summit 2026 — La Réunion",
      eventDateLabel: "15 novembre 2026",
      eventLocation: "Palais des Congrès, Saint-Denis",
      participantName: "Jean-Pierre Rakoto",
      participantTitle: null,
      companyName: null,
      avatarUrl: null,
      accessLabel: "Member",
      qrCodeDataUrl: TINY_PNG_DATA_URL,
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
