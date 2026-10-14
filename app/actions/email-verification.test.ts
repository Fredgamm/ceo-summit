import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/email-verification", () => ({ sendEmailVerification: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: vi.fn() }, auditLog: { create: vi.fn() } },
}));

import { requireViewer } from "@/lib/require-viewer";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmailVerification } from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";
import { changeUnverifiedEmail, resendEmailVerification } from "./email-verification";

function viewer(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    viewer: {
      id: "user_1",
      name: "Marie",
      email: "marie@test.local",
      emailVerifiedAt: null,
      ...overrides,
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireViewer).mockResolvedValue(viewer());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  vi.mocked(sendEmailVerification).mockResolvedValue(true);
});

describe("resendEmailVerification", () => {
  it("sends a new link to an unconfirmed account", async () => {
    expect((await resendEmailVerification()).success).toBe(true);
    expect(sendEmailVerification).toHaveBeenCalled();
  });

  it("does nothing for an already confirmed account", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer({ emailVerifiedAt: new Date() }));

    expect((await resendEmailVerification()).success).toBe(true);
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 60 });

    expect((await resendEmailVerification()).success).toBe(false);
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });
});

describe("changeUnverifiedEmail", () => {
  it("fixes a typo and sends the link to the corrected address", async () => {
    const result = await changeUnverifiedEmail("  Marie@Example.MG ");

    expect(result.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { email: "marie@example.mg" },
    });
    expect(sendEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ email: "marie@example.mg" })
    );
  });

  it("refuses to change an address that is already confirmed", async () => {
    vi.mocked(requireViewer).mockResolvedValue(viewer({ emailVerifiedAt: new Date() }));

    expect((await changeUnverifiedEmail("other@example.mg")).success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses an address used by another account", async () => {
    vi.mocked(prisma.user.update).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "5.22.0" })
    );

    const result = await changeUnverifiedEmail("taken@example.mg");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/déjà utilisée/);
  });

  it("refuses an invalid address", async () => {
    expect((await changeUnverifiedEmail("pas-un-email")).success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
