import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn().mockResolvedValue({}) },
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
  linkedinUrl: "https://linkedin.com/in/marie-dupont",
  country: "Madagascar",
  sectors: ["Finance & Banque"],
};

describe("updateProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
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
        linkedinUrl: "https://linkedin.com/in/marie-dupont",
        country: "Madagascar",
        sectors: ["Finance & Banque"],
      },
    });
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
