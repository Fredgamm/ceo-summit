import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    plan: { findFirst: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/request-ip", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/reset-password-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/password-changed-email", () => ({ default: vi.fn(() => null) }));

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTransactionalEmail } from "@/lib/resend";
import { requestPasswordReset, resetPassword } from "./auth";

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "jp@example.mg",
      status: "ACTIVE",
    } as never);
  });

  it("sends a reset email for an existing, non-suspended account", async () => {
    const result = await requestPasswordReset("jp@example.mg");

    expect(result.success).toBe(true);
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalled();
  });

  it("still reports success for an unknown email (anti-enumeration), without sending anything", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await requestPasswordReset("unknown@example.mg");

    expect(result.success).toBe(true);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects when the per-IP rate limit is exceeded, before ever touching the database", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 60 });

    const result = await requestPasswordReset("jp@example.mg");

    expect(result.success).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  const PASSWORD = "Password1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
      const list = ops as Promise<unknown>[];
      return Promise.all(list);
    });
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: "reset_1",
      userId: "user_1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: { id: "user_1", name: "Jean-Pierre Rakoto", email: "jp@example.mg" },
    } as never);
  });

  /**
   * 22 septembre 2026 (audit des emails transactionnels) — bonne pratique
   * sécurité absente jusqu'ici : rien ne confirmait au titulaire du compte
   * que son mot de passe venait de changer.
   */
  it("confirms the password change by email", async () => {
    const result = await resetPassword("token_1", PASSWORD, PASSWORD);

    expect(result.success).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jp@example.mg" })
    );
  });

  it("rejects an unknown token without sending anything", async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null);

    const result = await resetPassword("token_1", PASSWORD, PASSWORD);

    expect(result.success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects an expired token without sending anything", async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      id: "reset_1",
      userId: "user_1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: "user_1", name: "Jean-Pierre Rakoto", email: "jp@example.mg" },
    } as never);

    const result = await resetPassword("token_1", PASSWORD, PASSWORD);

    expect(result.success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
