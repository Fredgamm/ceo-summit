import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    membershipApplication: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/application-received-email", () => ({ default: vi.fn(() => null) }));

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { submitApplication } from "./apply";

function makeInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fullName: "Jean-Pierre Rakoto",
    email: "jp.rakoto@example.mg",
    companyName: "Rakoto Holding",
    title: "Directeur Général",
    sector: "Finance & Banque",
    country: "Madagascar",
    requestedTier: "EXECUTIVE",
    sponsorName: undefined,
    motivation: "Je souhaite rejoindre le cercle pour développer des partenariats régionaux.",
    consent: true,
    ...overrides,
  } as never;
}

describe("submitApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.membershipApplication.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.membershipApplication.create).mockResolvedValue({ id: "app_1" } as never);
  });

  it("creates the application with a consent timestamp and emails a confirmation", async () => {
    const result = await submitApplication(makeInput());

    expect(result.success).toBe(true);
    expect(prisma.membershipApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "jp.rakoto@example.mg",
          consentedAt: expect.any(Date),
        }),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jp.rakoto@example.mg" })
    );
  });

  it("rejects an email already tied to a real account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1" } as never);

    const result = await submitApplication(makeInput());

    expect(result.success).toBe(false);
    expect(prisma.membershipApplication.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate pending application for the same email", async () => {
    vi.mocked(prisma.membershipApplication.findFirst).mockResolvedValue({
      id: "app_existing",
    } as never);

    const result = await submitApplication(makeInput());

    expect(result.success).toBe(false);
    expect(prisma.membershipApplication.create).not.toHaveBeenCalled();
  });

  it("rejects when consent is not given", async () => {
    const result = await submitApplication(makeInput({ consent: false }));

    expect(result.success).toBe(false);
    expect(prisma.membershipApplication.create).not.toHaveBeenCalled();
  });

  it("rejects a motivation that is too short", async () => {
    const result = await submitApplication(makeInput({ motivation: "Trop court." }));

    expect(result.success).toBe(false);
    expect(prisma.membershipApplication.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid sector", async () => {
    const result = await submitApplication(makeInput({ sector: "Astrologie" }));

    expect(result.success).toBe(false);
  });

  it("lowercases the email before storing and checking", async () => {
    await submitApplication(makeInput({ email: "Jean.Rakoto@Example.MG" }));

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "jean.rakoto@example.mg" },
    });
  });
});
