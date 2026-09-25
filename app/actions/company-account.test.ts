import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = {
  user: { create: vi.fn(), update: vi.fn() },
  company: { create: vi.fn() },
  companySubscription: { create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    plan: { findFirst: vi.fn() },
    emailTemplateOverride: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
  },
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/request-ip", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/app/actions/company", () => ({ validateSectorAndCountry: vi.fn() }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateSectorAndCountry } from "@/app/actions/company";
import { sendTransactionalEmail } from "@/lib/resend";
import { createCompanyAccount } from "./company-account";

const VALID_INPUT = {
  planId: "plan_1",
  name: "Jean-Pierre Rakoto",
  email: "jp.rakoto@example.mg",
  password: "Password1",
  confirmPassword: "Password1",
  companyName: "Rakoto Holding",
  sector: "Finance & Banque",
  country: "Madagascar",
};

describe("createCompanyAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.plan.findFirst).mockResolvedValue({
      id: "plan_1",
      name: "Pack Entreprise",
      isActive: true,
      isSelfService: true,
    } as never);
    vi.mocked(sendTransactionalEmail).mockResolvedValue({} as never);
    process.env.NEXTAUTH_URL = "https://app.ceo-summit.mg";
    vi.mocked(validateSectorAndCountry).mockResolvedValue(null);
    txMock.user.create.mockResolvedValue({ id: "user_1" } as never);
    txMock.company.create.mockResolvedValue({ id: "company_1" } as never);
  });

  it("creates the account, the company, and a PENDING_PAYMENT subscription", async () => {
    const result = await createCompanyAccount(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Jean-Pierre Rakoto",
          email: "jp.rakoto@example.mg",
          status: "ACTIVE",
        }),
      })
    );
    expect(txMock.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Rakoto Holding",
          sector: "Finance & Banque",
          country: "Madagascar",
          companyAdminId: "user_1",
        }),
      })
    );
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { companyId: "company_1" },
    });
    expect(txMock.companySubscription.create).toHaveBeenCalledWith({
      data: { companyId: "company_1", planId: "plan_1", status: "PENDING_PAYMENT" },
    });
  });

  it("emails the new company admin a welcome pointing to the payment step", async () => {
    await createCompanyAccount(VALID_INPUT);

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jp.rakoto@example.mg" })
    );
  });

  it("still succeeds (and logs) when the welcome email fails to send", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("smtp down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createCompanyAccount(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      "[createCompanyAccount] failed to send admin welcome email",
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("only looks up self-service, non-upsell active plans", async () => {
    await createCompanyAccount(VALID_INPUT);

    expect(prisma.plan.findFirst).toHaveBeenCalledWith({
      where: { id: "plan_1", isActive: true, isSelfService: true, isUpsell: false },
    });
  });

  it("lowercases the email before checking and storing", async () => {
    await createCompanyAccount({ ...VALID_INPUT, email: "JP.Rakoto@Example.MG" });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "jp.rakoto@example.mg" },
    });
    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "jp.rakoto@example.mg" }) })
    );
  });

  it("rejects when the per-IP rate limit is exceeded, before touching the database", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 120 });

    const result = await createCompanyAccount(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects invalid input without creating anything", async () => {
    const result = await createCompanyAccount({ ...VALID_INPUT, email: "not-an-email" });

    expect(result.success).toBe(false);
    expect(txMock.user.create).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const result = await createCompanyAccount({ ...VALID_INPUT, confirmPassword: "Different1" });

    expect(result.success).toBe(false);
    expect(txMock.user.create).not.toHaveBeenCalled();
  });

  it("rejects when an account already exists for that email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await createCompanyAccount(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(txMock.user.create).not.toHaveBeenCalled();
  });

  it("rejects a plan that isn't active/self-service", async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue(null);

    const result = await createCompanyAccount(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(txMock.user.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid sector/country", async () => {
    vi.mocked(validateSectorAndCountry).mockResolvedValue("Secteur invalide.");

    const result = await createCompanyAccount(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(txMock.user.create).not.toHaveBeenCalled();
  });
});
