import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    plan: { findFirst: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    activationToken: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    emailTemplateOverride: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/request-ip", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTransactionalEmail } from "@/lib/resend";
import { activateAccount, requestPasswordReset, resendActivationLink, resetPassword } from "./auth";

/** Supporte les deux formes de `$transaction` (tableau et callback interactif). */
function mockTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: typeof prisma) => unknown)(prisma);
    return Promise.all(arg as Promise<unknown>[]);
  });
}

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "jp@example.mg",
      status: "ACTIVE",
    } as never);
  });

  it("invalidates the user's previous unused reset tokens when issuing a new one", async () => {
    await requestPasswordReset("jp@example.mg");

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
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
    mockTransaction();
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 1 });
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
  /**
   * 25 septembre 2026 (audit MVP) — deux requêtes concurrentes passaient
   * toutes les deux le contrôle `usedAt` avant qu'une ne marque le token.
   */
  it("rejects when the token was consumed concurrently, without changing the password", async () => {
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 });

    const result = await resetPassword("token_1", PASSWORD, PASSWORD);

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("activateAccount", () => {
  const PASSWORD = "Password1";

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction();
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue({
      id: "act_1",
      userId: "user_1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } as never);
    vi.mocked(prisma.activationToken.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.user.update).mockResolvedValue({ email: "jp@example.mg" } as never);
  });

  it("claims the token atomically and activates the account", async () => {
    const result = await activateAccount("token_1", PASSWORD, PASSWORD);

    expect(result).toEqual({ success: true, data: { email: "jp@example.mg" } });
    expect(prisma.activationToken.updateMany).toHaveBeenCalledWith({
      where: { id: "act_1", usedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) })
    );
  });

  it("rejects when the token was consumed concurrently, without touching the user", async () => {
    vi.mocked(prisma.activationToken.updateMany).mockResolvedValue({ count: 0 });

    const result = await activateAccount("token_1", PASSWORD, PASSWORD);

    expect(result.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

/**
 * 25 septembre 2026 (audit MVP) — réponse neutre : le formulaire public ne
 * doit plus révéler si un compte existe ni son statut.
 */
describe("resendActivationLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(prisma.activationToken.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre Rakoto",
      email: "jp@example.mg",
      status: "PENDING_ACTIVATION",
    } as never);
  });

  it("sends a new link to a pending account", async () => {
    const result = await resendActivationLink("jp@example.mg");

    expect(result).toEqual({ success: true, data: undefined });
    expect(prisma.activationToken.create).toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jp@example.mg" })
    );
  });

  it("rejects when the per-IP rate limit is exceeded, before touching the database", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 60 });

    const result = await resendActivationLink("jp@example.mg");

    expect(result.success).toBe(false);
    expect(checkRateLimit).toHaveBeenCalledWith("activation-resend:127.0.0.1", 5, 3600);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown email", () => vi.mocked(prisma.user.findUnique).mockResolvedValue(null)],
    [
      "an already active account",
      () =>
        vi
          .mocked(prisma.user.findUnique)
          .mockResolvedValue({ id: "user_1", status: "ACTIVE" } as never),
    ],
    [
      "an account over its resend cap",
      () => vi.mocked(prisma.activationToken.count).mockResolvedValue(3),
    ],
  ])("returns the same neutral success for %s, without sending", async (_label, setup) => {
    setup();

    const result = await resendActivationLink("jp@example.mg");

    expect(result).toEqual({ success: true, data: undefined });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("stays neutral when the email fails to send", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("Resend down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    const result = await resendActivationLink("jp@example.mg");

    expect(result).toEqual({ success: true, data: undefined });
  });
});
