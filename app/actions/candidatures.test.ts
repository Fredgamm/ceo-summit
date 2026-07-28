import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    membershipApplication: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    activationToken: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/activation-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/application-refused-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/application-more-info-email", () => ({ default: vi.fn(() => null) }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { AdminAccessError } from "@/lib/admin-auth";
import {
  approveApplication,
  refuseApplication,
  requestMoreInfo,
  saveApplicationNote,
} from "./candidatures";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN" } } as never;

function makeApplication(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "app_1",
    fullName: "Sonia Bouchard",
    email: "sonia@example.com",
    companyName: "TotalEnergies OI",
    title: "Directrice Générale",
    sector: "Énergie & Environnement",
    country: "La Réunion",
    requestedTier: "EXECUTIVE",
    status: "PENDING",
    adminNote: null,
    ...overrides,
  } as never;
}

describe("candidature admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  });

  describe("approveApplication", () => {
    it("creates the user, an activation token, and sends the activation email", async () => {
      vi.mocked(prisma.membershipApplication.findUnique).mockResolvedValue(makeApplication());
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "user_1",
        email: "sonia@example.com",
        name: "Sonia Bouchard",
      } as never);

      const result = await approveApplication("app_1", "EXECUTIVE");

      expect(result.success).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: "EXECUTIVE", status: "PENDING_ACTIVATION" }),
        })
      );
      expect(prisma.activationToken.create).toHaveBeenCalledTimes(1);
      expect(prisma.membershipApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) })
      );
      expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    });

    it("rejects when the application is not pending", async () => {
      vi.mocked(prisma.membershipApplication.findUnique).mockResolvedValue(
        makeApplication({ status: "APPROVED" })
      );

      const result = await approveApplication("app_1", "EXECUTIVE");

      expect(result.success).toBe(false);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects when a user already exists for that email", async () => {
      vi.mocked(prisma.membershipApplication.findUnique).mockResolvedValue(makeApplication());
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

      const result = await approveApplication("app_1", "EXECUTIVE");

      expect(result.success).toBe(false);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("throws when the caller isn't an admin", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: "user_1", role: "MEMBER" } } as never);

      await expect(approveApplication("app_1", "EXECUTIVE")).rejects.toBeInstanceOf(
        AdminAccessError
      );
    });

    it("throws when the admin sub-role can't access candidatures (financier)", async () => {
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "FINANCIER" } as never);

      await expect(approveApplication("app_1", "EXECUTIVE")).rejects.toBeInstanceOf(
        AdminAccessError
      );
    });
  });

  describe("refuseApplication", () => {
    it("marks the application refused and sends a reason-free decline email", async () => {
      vi.mocked(prisma.membershipApplication.findUnique).mockResolvedValue(makeApplication());

      const result = await refuseApplication("app_1", "Secteur non prioritaire");

      expect(result.success).toBe(true);
      expect(prisma.membershipApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "REFUSED",
            adminNote: "Secteur non prioritaire",
          }),
        })
      );
      expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    });

    it("rejects when the application is not pending", async () => {
      vi.mocked(prisma.membershipApplication.findUnique).mockResolvedValue(
        makeApplication({ status: "REFUSED" })
      );

      const result = await refuseApplication("app_1", "x");
      expect(result.success).toBe(false);
    });
  });

  describe("requestMoreInfo", () => {
    it("appends a note and emails the candidate", async () => {
      vi.mocked(prisma.membershipApplication.findUnique).mockResolvedValue(makeApplication());

      const result = await requestMoreInfo("app_1", "Merci de fournir un extrait KBIS.");

      expect(result.success).toBe(true);
      expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    });

    it("rejects an empty message", async () => {
      const result = await requestMoreInfo("app_1", "   ");
      expect(result.success).toBe(false);
      expect(sendTransactionalEmail).not.toHaveBeenCalled();
    });
  });

  describe("saveApplicationNote", () => {
    it("updates the admin note", async () => {
      const result = await saveApplicationNote("app_1", "Dossier solide.");
      expect(result.success).toBe(true);
      expect(prisma.membershipApplication.update).toHaveBeenCalledWith({
        where: { id: "app_1" },
        data: { adminNote: "Dossier solide." },
      });
    });
  });
});
