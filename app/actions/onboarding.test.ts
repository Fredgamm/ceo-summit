import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn().mockResolvedValue({}) },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  finishOnboarding,
  saveOnboardingProfileStep,
  saveOnboardingSectorsStep,
} from "./onboarding";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

describe("onboarding server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
  });

  describe("saveOnboardingProfileStep", () => {
    it("persists title and bio for the current session's user", async () => {
      const result = await saveOnboardingProfileStep("Directrice Générale", "Quelques lignes.");

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { title: "Directrice Générale", bio: "Quelques lignes." },
      });
    });

    it("rejects a bio over the length limit without touching the database", async () => {
      const result = await saveOnboardingProfileStep("CEO", "x".repeat(751));

      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("throws when there is no authenticated session", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      await expect(saveOnboardingProfileStep("CEO", "bio")).rejects.toThrow();
    });
  });

  describe("saveOnboardingSectorsStep", () => {
    it("persists a valid subset of the canonical sector list", async () => {
      const result = await saveOnboardingSectorsStep(["Finance & Banque", "Technologie & Digital"]);

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { sectors: ["Finance & Banque", "Technologie & Digital"] },
      });
    });

    it("rejects an unknown sector without touching the database", async () => {
      const result = await saveOnboardingSectorsStep(["Not A Real Sector"]);

      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("finishOnboarding", () => {
    it("stamps onboardingCompletedAt for the current user", async () => {
      const result = await finishOnboarding();

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { onboardingCompletedAt: expect.any(Date) },
      });
    });
  });
});
