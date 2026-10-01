import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    serviceListing: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-service-listing-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { deleteServiceListing, submitServiceListing, updateServiceListing } from "./services";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

const VALID_INPUT = {
  category: "Juridique & Fiscal",
  title: "Audit stratégique & accompagnement levée de fonds",
  description:
    "Nous accompagnons les PME dans leurs opérations de levée de fonds et de croissance.",
  priceInfo: "Sur devis",
  gallery: [] as string[],
};

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    name: "Jean-Pierre Rakoto",
    status: "ACTIVE",
    companyId: null,
    company: { subscription: { status: "ACTIVE", plan: { rank: 2 } } },
    ...overrides,
  } as never;
}

describe("submitServiceListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.serviceListing.findFirst).mockResolvedValue(null);
    process.env.ADMIN_ALERT_EMAIL = "admin@ceo-summit.mg";
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await submitServiceListing(VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input without creating anything", async () => {
    const result = await submitServiceListing({ ...VALID_INPUT, title: "short" });
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING_MODERATION listing and alerts the admin", async () => {
    vi.mocked(prisma.serviceListing.create).mockResolvedValue({
      id: "svc_1",
      title: VALID_INPUT.title,
    } as never);

    const result = await submitServiceListing(VALID_INPUT);

    expect(result).toEqual({ success: true, data: { id: "svc_1" } });
    expect(prisma.serviceListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorId: "user_1", status: "PENDING_MODERATION" }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  /**
   * Rapport QA du 1er oct. 2026 (§2.5) — la limite "1 fiche active par
   * entreprise" est retirée : une entreprise peut avoir plusieurs services.
   */
  it("allows a second submission even when one is already active", async () => {
    vi.mocked(prisma.serviceListing.create).mockResolvedValue({ id: "svc_2" } as never);
    const result = await submitServiceListing(VALID_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.serviceListing.findFirst).not.toHaveBeenCalled();
  });

  /**
   * Audit sécurité (25 septembre 2026) — `gallery` acceptait n'importe
   * quelle URL (externe, ou image d'un autre membre).
   */
  it("accepts gallery images uploaded by the caller", async () => {
    vi.mocked(prisma.serviceListing.create).mockResolvedValue({ id: "svc_1", title: "x" } as never);
    const result = await submitServiceListing({
      ...VALID_INPUT,
      gallery: ["/api/dev/local-storage/ceo-summit-documents/services/user_1/abc.jpg"],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["an external URL", "https://evil.example.com/pixel.jpg"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["another member's image", "/api/dev/local-storage/ceo-summit-documents/services/user_2/a.jpg"],
    [
      "a path-traversal URL",
      "/api/dev/local-storage/ceo-summit-documents/services/user_1/../../company-payments/user_2/r.pdf",
    ],
  ])("rejects %s without creating anything", async (_label, url) => {
    const result = await submitServiceListing({ ...VALID_INPUT, gallery: [url] });
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.create).not.toHaveBeenCalled();
  });
});

describe("updateServiceListing", () => {
  const EXISTING_LISTING = {
    id: "svc_1",
    authorId: "user_1",
    companyId: "company_1",
    company: { companyAdminId: "admin_1" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.serviceListing.findUnique).mockResolvedValue(EXISTING_LISTING as never);
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await updateServiceListing("svc_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.update).not.toHaveBeenCalled();
  });

  it("rejects when the listing does not exist", async () => {
    vi.mocked(prisma.serviceListing.findUnique).mockResolvedValue(null);
    const result = await updateServiceListing("svc_missing", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.update).not.toHaveBeenCalled();
  });

  it("allows the original author to edit", async () => {
    const result = await updateServiceListing("svc_1", VALID_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.serviceListing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "svc_1" },
        data: expect.objectContaining({ status: "PENDING_MODERATION" }),
      })
    );
  });

  it("allows the current company admin to edit, even if not the original author", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      makeViewer({ id: "admin_1", companyId: "company_1" })
    );
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin_1" } } as never);
    const result = await updateServiceListing("svc_1", VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects an unrelated member", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer({ id: "stranger" }));
    vi.mocked(auth).mockResolvedValue({ user: { id: "stranger" } } as never);
    const result = await updateServiceListing("svc_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.update).not.toHaveBeenCalled();
  });

  it("rejects invalid input without updating anything", async () => {
    const result = await updateServiceListing("svc_1", { ...VALID_INPUT, title: "short" });
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.update).not.toHaveBeenCalled();
  });
});

describe("deleteServiceListing", () => {
  const EXISTING_LISTING = {
    id: "svc_1",
    authorId: "user_1",
    companyId: "company_1",
    company: { companyAdminId: "admin_1" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
    vi.mocked(prisma.serviceListing.findUnique).mockResolvedValue(EXISTING_LISTING as never);
  });

  it("allows the original author to delete", async () => {
    const result = await deleteServiceListing("svc_1");
    expect(result.success).toBe(true);
    expect(prisma.serviceListing.delete).toHaveBeenCalledWith({ where: { id: "svc_1" } });
  });

  it("rejects an unrelated member", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer({ id: "stranger" }));
    vi.mocked(auth).mockResolvedValue({ user: { id: "stranger" } } as never);
    const result = await deleteServiceListing("svc_1");
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.delete).not.toHaveBeenCalled();
  });
});
