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
import { requestPasswordReset } from "./auth";

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
