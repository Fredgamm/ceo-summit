import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    plan: { findFirst: vi.fn() },
    passwordResetToken: { create: vi.fn() },
    activationToken: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    // Tests below exercise the transaction body directly against the same
    // top-level mocks (tx.* === prisma.* here) rather than a separate fake
    // client — sufficient since none of this file's transactions rely on
    // real cross-statement isolation.
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
  },
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/request-ip", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/reset-password-email", () => ({ default: vi.fn(() => null) }));
vi.mock("@/emails/activation-email", () => ({ default: vi.fn(() => null) }));

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTransactionalEmail } from "@/lib/resend";
import { signup, requestPasswordReset, activateAccount, resendActivationLink } from "./auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see $transaction mock above
const prismaMock = prisma as any;

const VALID = {
  name: "Jean-Pierre Rakoto",
  email: "jp.rakoto@example.mg",
  password: "Password1",
  confirmPassword: "Password1",
};

describe("signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user_1",
      name: VALID.name,
      email: VALID.email,
    } as never);
  });

  it("rejects when the per-IP signup rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 120 });

    const result = await signup(VALID.name, VALID.email, VALID.password, VALID.confirmPassword);

    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates an ACTIVE user with a password hash set immediately (no activation email step)", async () => {
    const result = await signup(VALID.name, VALID.email, VALID.password, VALID.confirmPassword);

    expect(result.success).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: VALID.name,
          email: VALID.email,
          status: "ACTIVE",
          passwordHash: expect.any(String),
        }),
      })
    );
  });

  it("rejects an email already tied to an account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await signup(VALID.name, VALID.email, VALID.password, VALID.confirmPassword);

    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a name that is too short", async () => {
    const result = await signup("J", VALID.email, VALID.password, VALID.confirmPassword);
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const result = await signup(VALID.name, "not-an-email", VALID.password, VALID.confirmPassword);
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const result = await signup(VALID.name, VALID.email, VALID.password, "Different1");
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a weak password", async () => {
    const result = await signup(VALID.name, VALID.email, "weak", "weak");
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("lowercases the email before checking and storing", async () => {
    await signup(VALID.name, "Jean.Rakoto@Example.MG", VALID.password, VALID.confirmPassword);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "jean.rakoto@example.mg" },
    });
  });

  it("stores a valid intended plan id from a deep link", async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue({ id: "plan_1" } as never);

    await signup(VALID.name, VALID.email, VALID.password, VALID.confirmPassword, "plan_1");

    expect(prisma.plan.findFirst).toHaveBeenCalledWith({
      where: { id: "plan_1", isActive: true, isSelfService: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ intendedPlanId: "plan_1" }) })
    );
  });

  it("silently ignores an invalid/inactive intended plan id", async () => {
    vi.mocked(prisma.plan.findFirst).mockResolvedValue(null);

    const result = await signup(
      VALID.name,
      VALID.email,
      VALID.password,
      VALID.confirmPassword,
      "not_a_real_plan"
    );

    expect(result.success).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ intendedPlanId: undefined }) })
    );
  });
});

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

  /**
   * Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
   * "pattern try/catch email admin appliqué de façon inégale" : le token
   * existe déjà en base à ce stade.
   */
  it("still reports success when the reset email fails to send", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("Resend down"));

    const result = await requestPasswordReset("jp@example.mg");

    expect(result.success).toBe(true);
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
  });
});

describe("activateAccount", () => {
  const PASSWORD = { password: "Password1", confirmPassword: "Password1" };
  const RECORD = {
    id: "tok_1",
    userId: "user_1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue(RECORD as never);
    vi.mocked(prisma.activationToken.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "user_1",
      email: "jp@example.mg",
    } as never);
  });

  it("sets the password, activates the account, and atomically claims the token", async () => {
    const result = await activateAccount("tok_1", PASSWORD.password, PASSWORD.confirmPassword);

    expect(result).toEqual({ success: true, data: { email: "jp@example.mg" } });
    expect(prisma.activationToken.updateMany).toHaveBeenCalledWith({
      where: { id: "tok_1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("rejects an unknown token", async () => {
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue(null);

    const result = await activateAccount("bad", PASSWORD.password, PASSWORD.confirmPassword);

    expect(result.success).toBe(false);
  });

  it("rejects an expired token", async () => {
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue({
      ...RECORD,
      expiresAt: new Date(Date.now() - 1000),
    } as never);

    const result = await activateAccount("tok_1", PASSWORD.password, PASSWORD.confirmPassword);

    expect(result.success).toBe(false);
  });

  it("rejects a token already marked used at the initial read", async () => {
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue({
      ...RECORD,
      usedAt: new Date(),
    } as never);

    const result = await activateAccount("tok_1", PASSWORD.password, PASSWORD.confirmPassword);

    expect(result.success).toBe(false);
    expect(prisma.activationToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects concurrent double-activation even when the initial read still shows the token unused", async () => {
    // Simulates a second concurrent call arriving right after a first one
    // already claimed the token: this call's own `findUnique` still read
    // `usedAt: null` (stale), but the conditional `updateMany` finds no row
    // left to claim.
    vi.mocked(prisma.activationToken.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await activateAccount("tok_1", PASSWORD.password, PASSWORD.confirmPassword);

    expect(result).toEqual({ success: false, error: "Ce lien a déjà été utilisé." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("resendActivationLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "jp@example.mg",
      name: "Jean-Pierre",
      status: "PENDING_ACTIVATION",
    } as never);
    vi.mocked(prisma.activationToken.count).mockResolvedValue(0);
  });

  it("sends a new activation email for a pending account", async () => {
    const result = await resendActivationLink("jp@example.mg");

    expect(result.success).toBe(true);
    expect(prisma.activationToken.create).toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalled();
  });

  it("rejects when the per-IP rate limit is exceeded, before ever touching the database", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 60 });

    const result = await resendActivationLink("jp@example.mg");

    expect(result.success).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an already-active account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "jp@example.mg",
      status: "ACTIVE",
    } as never);

    const result = await resendActivationLink("jp@example.mg");

    expect(result.success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects past the per-email daily resend cap (RG-P1-04, 3/24h)", async () => {
    vi.mocked(prisma.activationToken.count).mockResolvedValue(3);

    const result = await resendActivationLink("jp@example.mg");

    expect(result.success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("still reports success when the activation email fails to send", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("Resend down"));

    const result = await resendActivationLink("jp@example.mg");

    expect(result.success).toBe(true);
    expect(prisma.activationToken.create).toHaveBeenCalled();
  });
});
