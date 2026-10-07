import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/referentials-query", () => ({
  getReferentialLabels: vi.fn((type: string) =>
    Promise.resolve(type === "sector" ? ["Finance & Banque"] : ["Madagascar"])
  ),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateProfile } from "./profile";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

const VALID_INPUT = {
  name: "Marie Dupont",
  title: "Directrice Générale",
  bio: "Quelques lignes.",
  websiteUrl: "",
  linkedinUrl: "https://linkedin.com/in/marie-dupont",
  country: "Madagascar",
  sectors: ["Finance & Banque"],
  phone: "034 12 345 67",
};

describe("updateProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
    } as never);
  });

  /** Audit sécurité (25 septembre 2026) — statut relu en base, pas seulement la session. */
  it("rejects a suspended member whose session is still open", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "SUSPENDED",
    } as never);

    const result = await updateProfile(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a javascript: website URL", async () => {
    const result = await updateProfile({ ...VALID_INPUT, websiteUrl: "javascript:alert(1)" });

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("persists valid input for the current session's user", async () => {
    const result = await updateProfile(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        name: "Marie Dupont",
        title: "Directrice Générale",
        bio: "Quelques lignes.",
        websiteUrl: null,
        linkedinUrl: "https://linkedin.com/in/marie-dupont",
        country: "Madagascar",
        sectors: ["Finance & Banque"],
        phone: "034 12 345 67",
      },
    });
  });

  it("rejects an empty title without touching the database", async () => {
    const result = await updateProfile({ ...VALID_INPUT, title: "" });

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  /**
   * Audit QA (22 septembre 2026) — les champs URL rejetaient toute saisie
   * sans "https://" explicite ; ils sont désormais normalisés avant
   * validation (voir lib/normalize-url.ts).
   */
  it("normalizes a bare domain into a full URL before persisting", async () => {
    const result = await updateProfile({
      ...VALID_INPUT,
      websiteUrl: "monentreprise.mg",
      linkedinUrl: "linkedin.com/in/marie-dupont",
    });

    expect(result.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          websiteUrl: "https://monentreprise.mg",
          linkedinUrl: "https://linkedin.com/in/marie-dupont",
        }),
      })
    );
  });

  it("rejects an invalid website URL without touching the database", async () => {
    const result = await updateProfile({ ...VALID_INPUT, websiteUrl: "not a url" });

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  /**
   * Gestion corporate (7 août 2026) — le téléphone n'était collecté nulle
   * part avant ce champ, requis pour notifier par SMS (Befiana) l'admin
   * entreprise d'un achat groupé.
   */
  it("persists a phone number when provided", async () => {
    const result = await updateProfile({ ...VALID_INPUT, phone: "034 12 345 67" });

    expect(result.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: "034 12 345 67" }) })
    );
  });

  it("rejects a missing phone number", async () => {
    const result = await updateProfile({ ...VALID_INPUT, phone: "" });

    expect(result).toEqual({ success: false, error: "Le téléphone est requis" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a phone number that is too short", async () => {
    const result = await updateProfile({ ...VALID_INPUT, phone: "034 12" });

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a phone number with invalid characters without touching the database", async () => {
    const result = await updateProfile({ ...VALID_INPUT, phone: "call me maybe" });

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a non-LinkedIn URL without touching the database", async () => {
    const result = await updateProfile({ ...VALID_INPUT, linkedinUrl: "https://twitter.com/x" });

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown sector without touching the database", async () => {
    const result = await updateProfile({ ...VALID_INPUT, sectors: ["Not A Real Sector"] });

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns a failure without throwing when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await updateProfile(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
