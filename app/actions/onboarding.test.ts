import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "user_1", status: "ACTIVE", sectors: [], company: null }),
    },
  },
}));

vi.mock("@/lib/referentials-query", () => ({
  getReferentialLabels: vi.fn().mockResolvedValue(["Finance & Banque", "Technologie & Digital"]),
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

    /**
     * Correctif (7 août 2026, audit) — cette action levait auparavant une
     * `Error` brute plutôt que de retourner `ActionResult` comme partout
     * ailleurs (`requireActiveUserId()`, remplacé depuis par
     * `requireViewer()`).
     */
    it("returns a graceful error when there is no authenticated session, instead of throwing", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      const result = await saveOnboardingProfileStep("CEO", "bio");
      expect(result.success).toBe(false);
    });

    it("rejects a viewer suspended after their session was issued", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user_1",
        status: "SUSPENDED",
      } as never);
      const result = await saveOnboardingProfileStep("CEO", "bio");
      expect(result.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
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

    it("gives a company member the sector of their company, without asking", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user_1",
        status: "ACTIVE",
        sectors: [],
        company: { sector: "Finance & Banque" },
      } as never);

      await finishOnboarding();

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { onboardingCompletedAt: expect.any(Date), sectors: ["Finance & Banque"] },
      });
    });

    it("keeps sectors the member already chose", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user_1",
        status: "ACTIVE",
        sectors: ["Technologie & Digital"],
        company: { sector: "Finance & Banque" },
      } as never);

      await finishOnboarding();

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { onboardingCompletedAt: expect.any(Date) },
      });
    });
  });
});
