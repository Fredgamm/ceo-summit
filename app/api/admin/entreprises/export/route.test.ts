import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    companySubscription: { findMany: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

function request(query = "") {
  return new Request(`http://localhost/api/admin/entreprises/export${query}`);
}

describe("GET /api/admin/entreprises/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.companySubscription.findMany).mockResolvedValue([
      {
        status: "PENDING_PAYMENT",
        declaredParticipants: 3,
        extraSeats: 0,
        startDate: null,
        endDate: null,
        updatedAt: new Date("2026-11-24T10:00:00Z"),
        company: {
          name: "=Société; test",
          sector: "Technologie & Digital",
          country: "Madagascar",
          phone: "+261 380816352",
          website: null,
          createdAt: new Date("2026-11-20T10:00:00Z"),
          companyAdmin: {
            name: "Ando R.",
            email: "ando@example.com",
            title: "Gérante",
            phone: "+261 340000000",
          },
        },
        plan: {
          name: "Early Bird",
          priceAr: 4237593,
          pricingMode: "PER_PARTICIPANT",
          isActive: true,
          isSelfService: true,
          isUpsell: false,
        },
        payments: [],
      },
    ] as never);
  });

  it("rejects a non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns an Excel-ready CSV of all matching subscriptions, without pagination", async () => {
    const res = await GET(request("?statut=PENDING_PAYMENT&page=3"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("entreprises-ceo-summit.csv");

    const args = vi.mocked(prisma.companySubscription.findMany).mock.calls[0][0]!;
    expect(args.where).toEqual({ AND: [{ status: "PENDING_PAYMENT" }] });
    expect(args).not.toHaveProperty("skip");
    expect(args).not.toHaveProperty("take");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).split("\r\n");
    expect(lines[0]).toMatch(/^Entreprise;Secteur;Pays;/);
    // Formule neutralisée et champ contenant « ; » entre guillemets.
    expect(lines[1]).toMatch(/^"'=Société; test";/);
    expect(lines[1]).toContain(
      "Early Bird;4237593;Par participant;Non;En attente de paiement;Non;3;0"
    );
  });
});
