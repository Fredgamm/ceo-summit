import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    membership: { findMany: vi.fn() },
    eventRegistration: { findMany: vi.fn() },
    creditPurchase: { findMany: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

describe("GET /api/admin/finances/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([
      {
        id: "m1",
        tier: "CHAIRMAN",
        price: 1_500_000,
        createdAt: new Date("2026-01-15"),
        user: { name: "Sarah R." },
      },
    ] as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      {
        id: "r1",
        paymentMethod: "VIREMENT",
        createdAt: new Date("2026-07-15"),
        user: { name: "Jean-Pierre R." },
        event: { title: "CEO Summit 2026", price: 1_500_000 },
      },
    ] as never);
    vi.mocked(prisma.creditPurchase.findMany).mockResolvedValue([
      {
        id: "c1",
        credits: 5,
        priceAr: 100_000,
        paymentMethod: "MOBILE_MONEY",
        createdAt: new Date("2026-07-20"),
        user: { name: "Rabe A." },
      },
    ] as never);
  });

  it("rejects a non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns a CSV with every transaction source, most recent first", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("export-comptable");

    const body = await res.text();
    const lines = body.split("\r\n");
    expect(lines[0]).toBe("Membre,Source,Description,Montant (Ar),Méthode,Date");
    // Most recent (credits, 20/07) before event (15/07) before membership (15/01)
    expect(lines[1]).toContain("Rabe A.");
    expect(lines[2]).toContain("Jean-Pierre R.");
    expect(lines[3]).toContain("Sarah R.");
  });
});
