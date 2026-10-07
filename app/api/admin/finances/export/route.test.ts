import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    companyPayment: { findMany: vi.fn() },
    eventRegistration: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/currency-conversion", () => ({ getEurToArRate: vi.fn().mockResolvedValue(4800) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

function request(query = "") {
  return new Request(`http://localhost/api/admin/finances/export${query}`);
}

describe("GET /api/admin/finances/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.companyPayment.findMany).mockResolvedValue([
      {
        id: "m1",
        amount: 1_500_000,
        eurToArRate: 5000,
        method: "VIREMENT",
        createdAt: new Date("2026-01-15"),
        upsellQuantity: null,
        upsellPlan: null,
        companySubscription: {
          company: { name: "Sarah R." },
          plan: { name: "Gold" },
        },
      },
    ] as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      {
        id: "r1",
        eurToArRate: null,
        paymentMethod: "VIREMENT",
        createdAt: new Date("2026-07-15"),
        user: { name: "Jean-Pierre R." },
        event: { title: "CEO Summit 2026", price: 960_000 },
      },
    ] as never);
  });

  it("rejects a non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns a CSV with euros first, then Ariary and the rate, most recent first", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("export-comptable-ceo-summit.csv");

    const bytes = new Uint8Array(await res.arrayBuffer());
    // Marqueur UTF-8 pour qu'Excel lise les accents et « € ».
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).split("\r\n");
    expect(lines[0]).toBe(
      "Membre;Source;Description;Montant (€);Montant (Ar);Taux (Ar/€);Taux estimé;Méthode;Date"
    );
    // Événement (15/07) au taux du jour faute de taux enregistré, avant l'offre (15/01).
    expect(lines[1]).toContain("Jean-Pierre R.");
    expect(lines[1]).toContain("200,00;960000;4800,00;Oui");
    expect(lines[2]).toContain("Sarah R.");
    expect(lines[2]).toContain("300,00;1500000;5000,00;Non");
  });

  it("returns the same content as a PDF with ?format=pdf", async () => {
    const res = await GET(request("?format=pdf"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("export-comptable-ceo-summit.pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("exports only confirmed company payments, never rejected ones", async () => {
    await GET(request());
    expect(prisma.companyPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "CONFIRMED" } })
    );
  });
});
