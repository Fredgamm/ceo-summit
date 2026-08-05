import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    serviceListing: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/admin-service-listing-alert-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { submitServiceListing } from "./services";

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
    process.env.ADMIN_ALERT_EMAIL = "admin@ceosummit.mg";
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

  it("rejects a second submission while one is already active for a non-Chairman", async () => {
    vi.mocked(prisma.serviceListing.findFirst).mockResolvedValue({ id: "existing" } as never);
    const result = await submitServiceListing(VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.serviceListing.create).not.toHaveBeenCalled();
  });

  it("scopes the active-listing check by companyId when the viewer has a company", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer({ companyId: "company_1" }));
    vi.mocked(prisma.serviceListing.create).mockResolvedValue({ id: "svc_1" } as never);

    await submitServiceListing(VALID_INPUT);

    expect(prisma.serviceListing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company_1" }),
      })
    );
  });

  it("bypasses the active-listing limit for a Chairman", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      makeViewer({ company: { subscription: { status: "ACTIVE", plan: { rank: 3 } } } })
    );
    vi.mocked(prisma.serviceListing.create).mockResolvedValue({ id: "svc_1" } as never);

    const result = await submitServiceListing(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(prisma.serviceListing.findFirst).not.toHaveBeenCalled();
  });
});
