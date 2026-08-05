import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    plan: { findFirst: vi.fn() },
    passwordResetToken: { create: vi.fn() },
  },
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/request-ip", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/reset-password-email", () => ({ default: vi.fn(() => null) }));

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTransactionalEmail } from "@/lib/resend";
import { signup, requestPasswordReset } from "./auth";

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
});
