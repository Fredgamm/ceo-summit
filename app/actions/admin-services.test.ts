import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    serviceListing: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/service-listing-approved-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/service-listing-refused-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { approveServiceListing, rejectServiceListing } from "./admin-services";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

function makeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "svc_1",
    title: "Audit stratégique",
    status: "PENDING_MODERATION",
    author: { email: "membre@example.com" },
    ...overrides,
  } as never;
}

describe("approveServiceListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.serviceListing.findUnique).mockResolvedValue(makeListing());
  });

  it("publishes the listing and emails the author", async () => {
    const result = await approveServiceListing("svc_1");
    expect(result.success).toBe(true);
    expect(prisma.serviceListing.update).toHaveBeenCalledWith({
      where: { id: "svc_1" },
      data: { status: "PUBLISHED" },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "membre@example.com" })
    );
  });

  it("rejects an already-processed listing", async () => {
    vi.mocked(prisma.serviceListing.findUnique).mockResolvedValue(
      makeListing({ status: "PUBLISHED" })
    );
    const result = await approveServiceListing("svc_1");
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.update).not.toHaveBeenCalled();
  });

  /**
   * Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
   * "pattern try/catch email admin appliqué de façon inégale" : la
   * publication et l'audit log sont déjà commités à ce stade.
   */
  it("still reports success when the approval email fails to send", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("Resend down"));
    const result = await approveServiceListing("svc_1");
    expect(result.success).toBe(true);
    expect(prisma.serviceListing.update).toHaveBeenCalled();
  });
});

describe("rejectServiceListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
    vi.mocked(prisma.serviceListing.findUnique).mockResolvedValue(makeListing());
  });

  it("marks the listing refused and emails the author", async () => {
    const result = await rejectServiceListing("svc_1");
    expect(result.success).toBe(true);
    expect(prisma.serviceListing.update).toHaveBeenCalledWith({
      where: { id: "svc_1" },
      data: { status: "REFUSED" },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "membre@example.com" })
    );
  });

  it("rejects an already-processed listing", async () => {
    vi.mocked(prisma.serviceListing.findUnique).mockResolvedValue(
      makeListing({ status: "REFUSED" })
    );
    const result = await rejectServiceListing("svc_1");
    expect(result.success).toBe(false);
  });
});
