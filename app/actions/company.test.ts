import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    company: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/referentials-query", () => ({
  getReferentialLabels: vi.fn((type: string) =>
    Promise.resolve(type === "sector" ? ["Finance & Banque"] : ["Madagascar"])
  ),
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
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: null,
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        company: { create: vi.fn().mockResolvedValue({ id: "company_1" }) },
        user: { update: vi.fn() },
      };
      return (fn as (tx: unknown) => Promise<unknown>)(tx);
    });
  });

  it("creates the company alone (no offer required) and makes the creator its admin", async () => {
    const result = await createCompany(VALID_INPUT);
    expect(result).toEqual({ success: true, data: { id: "company_1" } });
  });

  it("rejects a user already tied to a company", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: "existing_company",
      status: "ACTIVE",
    } as never);

    const result = await createCompany(VALID_INPUT);
    expect(result.success).toBe(false);
  });

  it("rejects invalid input", async () => {
    const result = await createCompany({ ...VALID_INPUT, sector: "Astrologie" });
    expect(result.success).toBe(false);
  });

  it("rejects when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await createCompany(VALID_INPUT);
    expect(result.success).toBe(false);
  });

  it("rejects a suspended account whose session is still valid (requireViewer)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: null,
      status: "SUSPENDED",
    } as never);
    const result = await createCompany(VALID_INPUT);
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts a logo uploaded by the caller through /api/company/logo", async () => {
    const result = await createCompany({
      ...VALID_INPUT,
      logoUrl: "/api/dev/local-storage/ceo-summit-avatars/company-logos/user_1/abc.jpg",
    });
    expect(result.success).toBe(true);
  });

  it.each([
    "https://evil.example.com/logo.jpg",
    "javascript:alert(1)",
    "/api/dev/local-storage/ceo-summit-avatars/company-logos/someone_else/abc.jpg",
    "/api/dev/local-storage/ceo-summit-avatars/company-logos/user_1/../x.jpg",
  ])(
    "rejects a logoUrl not produced by the logo upload route for the caller (%s)",
    async (logoUrl) => {
      const result = await createCompany({ ...VALID_INPUT, logoUrl });
      expect(result).toEqual({ success: false, error: expect.stringContaining("Logo invalide") });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  );
});

describe("updateCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      companyId: "company_1",
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: "company_1",
      companyAdminId: "user_1",
      logoUrl: "https://cdn.example.com/company-logos/previous_admin/old.jpg",
    } as never);
  });

  it("keeps the logo already on file even if uploaded by a previous admin", async () => {
    const result = await updateCompany("company_1", {
      ...VALID_INPUT,
      logoUrl: "https://cdn.example.com/company-logos/previous_admin/old.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a foreign logoUrl on update", async () => {
    const result = await updateCompany("company_1", {
      ...VALID_INPUT,
      logoUrl: "https://evil.example.com/logo.jpg",
    });
    expect(result.success).toBe(false);
    expect(prisma.company.update).not.toHaveBeenCalled();
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
