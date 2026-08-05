import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    company: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createCompany, updateCompany } from "./company";

const SESSION = { user: { id: "user_1" } } as never;

const VALID_INPUT = {
  name: "Rakoto Holding",
  sector: "Finance & Banque",
  country: "Madagascar",
  description: "",
  website: "",
  logoUrl: "",
  phone: "",
  address: "",
  linkedinUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  additionalInfo: "",
};

describe("createCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1", companyId: null } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan_1",
      isActive: true,
      scope: "COMPANY",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        company: { create: vi.fn().mockResolvedValue({ id: "company_1" }) },
        user: { update: vi.fn() },
        companySubscription: { create: vi.fn() },
      };
      return (fn as (tx: unknown) => Promise<unknown>)(tx);
    });
  });

  it("creates the company + subscription together and makes the creator its admin", async () => {
    const result = await createCompany({ ...VALID_INPUT, planId: "plan_1" });
    expect(result).toEqual({ success: true, data: { id: "company_1" } });
  });

  it("rejects a user already tied to a company", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: "existing_company",
    } as never);

    const result = await createCompany({ ...VALID_INPUT, planId: "plan_1" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid input", async () => {
    const result = await createCompany({ ...VALID_INPUT, sector: "Astrologie", planId: "plan_1" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing planId", async () => {
    const result = await createCompany(VALID_INPUT);
    expect(result.success).toBe(false);
  });

  it("rejects an inactive plan", async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan_1",
      isActive: false,
    } as never);

    const result = await createCompany({ ...VALID_INPUT, planId: "plan_1" });
    expect(result.success).toBe(false);
  });

  it("rejects when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await createCompany({ ...VALID_INPUT, planId: "plan_1" });
    expect(result.success).toBe(false);
  });
});

describe("updateCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "user_1",
    } as never);
  });

  it("updates when the caller is the company admin", async () => {
    const result = await updateCompany("company_1", VALID_INPUT);
    expect(result.success).toBe(true);
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "company_1" } })
    );
  });

  it("rejects a caller who isn't the company admin", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "someone_else",
    } as never);

    const result = await updateCompany("company_1", VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});
